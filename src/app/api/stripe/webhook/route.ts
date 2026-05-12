import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe lifecycle events and mirrors the subscription
 * state back to `salons`. Stripe is the source of truth; this row
 * is its local mirror — every status change in the dashboard or on
 * the Customer Portal flows through here.
 *
 * Events we care about:
 *   - customer.subscription.created  → new sub, set IDs + status
 *   - customer.subscription.updated  → plan change, status change,
 *                                       trial→active transition
 *   - customer.subscription.deleted  → subscription ended (canceled)
 *   - invoice.payment_succeeded      → safety re-sync after renewal
 *   - invoice.payment_failed         → safety re-sync after failure
 *
 * Signature verification is non-negotiable: anyone can POST to a
 * public webhook endpoint, but only Stripe can sign the body with
 * the shared secret. If signature verification fails we 400
 * immediately and Stripe will retry with backoff.
 *
 * The runtime is forced to nodejs (not edge) because we need
 * `await req.text()` to get the raw body for signature verification
 * — the edge runtime doesn't expose the raw bytes cleanly.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(admin, sub);
        break;
      }

      case "customer.subscription.deleted": {
        // Subscription fully ended (user canceled and the current
        // period closed, or Stripe canceled after dunning). Wipe
        // the subscription_id but keep the customer_id so the
        // owner can re-subscribe without going through Customer
        // creation again.
        const sub = event.data.object as Stripe.Subscription;
        await admin
          .from("salons")
          .update({
            stripe_subscription_id: null,
            subscription_status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", sub.customer as string);
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        // Re-fetch the subscription to capture status + period_end.
        // Stripe usually emits a subscription.updated alongside, but
        // we don't rely on event ordering — this keeps us correct
        // even if the events arrive out of order.
        const invoice = event.data.object as Stripe.Invoice;
        // Invoice.subscription is sometimes a string ID, sometimes
        // an expanded object; normalize either way.
        const subIdRaw = (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription;
        const subId = typeof subIdRaw === "string" ? subIdRaw : subIdRaw?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(admin, sub);
        }
        break;
      }

      default:
        // Unhandled event — ack with 200 so Stripe doesn't retry.
        // We listen for a small set; everything else is a no-op.
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    // 500 tells Stripe to retry. Up to a couple of days of backoff
    // before they give up, so transient DB issues self-heal.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Write a Stripe Subscription back to the salons row keyed by
 * stripe_customer_id. Maps Stripe's status enum to our identical
 * enum (we picked the same names in migration-033 deliberately).
 */
async function syncSubscription(
  admin: ReturnType<typeof createAdminClient>,
  sub: Stripe.Subscription,
) {
  // current_period_end on the Subscription itself was deprecated in
  // newer API versions; the equivalent now lives on each item's
  // period.end. Use the first item's period end (all items on one
  // subscription share the same cycle).
  const periodEndUnix =
    sub.items.data[0]?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  const currentPeriodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;

  // Status maps 1:1 — our CHECK constraint accepts the same strings
  // Stripe emits (trialing, active, past_due, canceled, incomplete).
  // "incomplete_expired" and "unpaid" don't match our enum; map them
  // onto the closest equivalent we already have.
  const status =
    sub.status === "incomplete_expired"
      ? "incomplete"
      : sub.status === "unpaid" || sub.status === "paused"
        ? "past_due"
        : sub.status;

  await admin
    .from("salons")
    .update({
      stripe_subscription_id: sub.id,
      subscription_status: status,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", sub.customer as string);
}
