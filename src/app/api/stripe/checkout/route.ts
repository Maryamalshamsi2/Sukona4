import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { stripePriceIdFor } from "@/lib/stripe-prices";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import { APP_URL } from "@/lib/constants";
import type { Plan, BillingPeriod } from "@/lib/plan";

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for the current salon and
 * redirects the user to Stripe's hosted page. Only the salon owner
 * can subscribe — staff and admins can't.
 *
 * Request body: { plan, billing_period }
 * Response: { url } — caller redirects window.location to this URL.
 *
 * Trial behavior: if the salon still has time on its app-managed
 * trial (salons.trial_ends_at in the future), we pass that timestamp
 * as `trial_end` on the Stripe subscription so the first charge
 * fires only when our trial would have expired. The user adds their
 * card now but isn't billed until the trial actually ends — the
 * "hybrid" trial flow.
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (profile.role !== "owner") {
    return NextResponse.json(
      { error: "Only the salon owner can manage billing" },
      { status: 403 },
    );
  }

  let body: { plan?: Plan; billing_period?: BillingPeriod };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = body.plan;
  const billingPeriod = body.billing_period;
  if (!plan || !["solo", "team", "multi_team"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  if (!billingPeriod || !["monthly", "annual"].includes(billingPeriod)) {
    return NextResponse.json({ error: "Invalid billing_period" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: salon, error: salonError } = await supabase
    .from("salons")
    .select("id, name, trial_ends_at, stripe_customer_id")
    .eq("id", profile.salon_id)
    .single();
  if (salonError || !salon) {
    return NextResponse.json({ error: "Salon not found" }, { status: 404 });
  }

  // Stripe customer is created once per salon and reused for all
  // future checkout/portal sessions. Owners with no customer ID yet
  // (their first time at billing) get one created and persisted.
  //
  // Two failure modes guarded here:
  //   1. stripe.customers.create throws (Stripe outage / rate limit).
  //      The bare `await` previously bubbled a raw 500 with no
  //      context; wrap so we can return a user-readable message.
  //   2. The .update of salons.stripe_customer_id silently fails
  //      (RLS, network blip). Without verifying the persist, we'd
  //      hand the customer to Stripe Checkout — payment succeeds,
  //      webhook arrives with a customer_id that doesn't exist in
  //      our DB, sync drifts forever. Abort before creating the
  //      session if the write didn't land.
  // Stripe-customer creation is the classic check-then-act race:
  // two concurrent checkouts both see stripe_customer_id=NULL, both
  // hit stripe.customers.create, and the second UPDATE overwrites
  // the first — leaving one customer orphaned in Stripe (no salon
  // row references it). Migration 052 adds a partial UNIQUE index
  // on salons.stripe_customer_id so the UPDATE becomes an atomic
  // claim: only one writer can succeed, the other gets 23505 and
  // re-fetches to use the winning id. The losing request's
  // customer is left behind as a one-off orphan in Stripe — we'd
  // need a cleanup job to delete it, but a single orphan is a
  // recoverable bookkeeping issue, not the silent billing drift
  // the prior code allowed.
  const stripe = getStripe();
  let customerId = salon.stripe_customer_id;
  if (!customerId) {
    let customer;
    try {
      customer = await stripe.customers.create({
        name: salon.name ?? undefined,
        metadata: { salon_id: salon.id },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Stripe customer creation failed";
      console.error("stripe.customers.create failed:", msg);
      return NextResponse.json(
        { error: "Couldn't start checkout — try again in a moment." },
        { status: 502 },
      );
    }
    customerId = customer.id;
    // Atomic claim — only writes if stripe_customer_id is still
    // NULL on the row. A concurrent checkout that won the race
    // gets count=0 here and we fall through to the re-fetch.
    const { error: persistErr, count: persistCount } = await supabase
      .from("salons")
      .update({ stripe_customer_id: customerId }, { count: "exact" })
      .eq("id", salon.id)
      .is("stripe_customer_id", null);
    if (persistErr) {
      // 23505 = unique_violation. Could happen if a duplicate from
      // a previous race attempt is still in Stripe and matches our
      // partial UNIQUE index. Same recovery path as a 0-row
      // update — re-fetch the winning id.
      const isDuplicate = (persistErr as { code?: string }).code === "23505";
      if (!isDuplicate) {
        console.error(
          `salons.stripe_customer_id persist failed for salon=${salon.id}, customer=${customerId}:`,
          persistErr.message,
        );
        return NextResponse.json(
          { error: "Couldn't save your billing profile — try again." },
          { status: 500 },
        );
      }
    }
    if (persistErr || (persistCount ?? 0) === 0) {
      // Lost the race. The other checkout's customer is the real
      // one; ours is an orphan in Stripe. Log it (a future cleanup
      // job can sweep stripe.customers.list metadata.salon_id and
      // delete strays) and continue with the persisted value.
      console.warn(
        `[stripe.checkout] lost create-customer race for salon=${salon.id}; orphan Stripe customer=${customerId} (winner will be re-fetched).`,
      );
      const { data: refetched } = await supabase
        .from("salons")
        .select("stripe_customer_id")
        .eq("id", salon.id)
        .single();
      if (!refetched?.stripe_customer_id) {
        // Should not happen — if our update returned 0 rows there's
        // either a winning row OR the salon row is gone. Defensive.
        return NextResponse.json(
          { error: "Couldn't load your billing profile — try again." },
          { status: 500 },
        );
      }
      customerId = refetched.stripe_customer_id;
    }
  }

  // Honor the in-progress trial. Stripe accepts a unix timestamp
  // (seconds, not ms). If trial already expired or was never set,
  // the subscription starts billing immediately on checkout.
  const trialMs = salon.trial_ends_at ? new Date(salon.trial_ends_at).getTime() : null;
  const useTrial = trialMs !== null && trialMs > Date.now();

  // Use the deploy-pinned APP_URL constant rather than the spoofable
  // Origin header. A spoofed Origin would otherwise redirect the user
  // post-payment to attacker-controlled URLs.
  const origin = APP_URL;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: stripePriceIdFor(plan, billingPeriod), quantity: 1 }],
      subscription_data: useTrial && trialMs
        ? { trial_end: Math.floor(trialMs / 1000), metadata: { salon_id: salon.id } }
        : { metadata: { salon_id: salon.id } },
      success_url: `${origin}/settings/billing?checkout=success`,
      cancel_url: `${origin}/settings/billing?checkout=cancelled`,
      // Tax handling: Stripe Tax auto-calculates UAE 5% VAT (and
      // other jurisdictions) once it's enabled in the dashboard.
      // Harmless if Tax isn't enabled yet — Stripe will just skip.
      automatic_tax: { enabled: true },
      // Required for automatic_tax when the Customer doesn't have
      // an address yet (newly-created customers don't). 'auto'
      // tells Stripe to copy the address the user enters at
      // checkout back onto the Customer record, which satisfies
      // Stripe Tax's "valid address" requirement and persists the
      // address for next time (Portal access, future invoices,
      // etc.).
      customer_update: { address: "auto", name: "auto" },
      // Forces the address fields to render in Checkout — without
      // this, Stripe might skip them and we end up with the same
      // "no address" error.
      billing_address_collection: "required",
      // Lets users redeem promo codes on the checkout page.
      allow_promotion_codes: true,
      // The salon_id metadata is what the webhook handler keys on
      // to find which row to update.
      metadata: {
        salon_id: salon.id,
        plan,
        billing_period: billingPeriod,
      },
    });
  } catch (err) {
    console.error("Stripe checkout creation failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout creation failed" },
      { status: 500 },
    );
  }

  if (!session.url) {
    return NextResponse.json({ error: "No checkout URL returned" }, { status: 500 });
  }
  return NextResponse.json({ url: session.url });
}
