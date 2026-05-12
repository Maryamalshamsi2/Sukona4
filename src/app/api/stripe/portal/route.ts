import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";

/**
 * POST /api/stripe/portal
 *
 * Creates a Customer Portal session and returns the URL. The
 * portal is Stripe-hosted and handles everything billing-related:
 * update card, view invoices, cancel, switch plan, etc. We don't
 * have to build any of that — saves a ton of UI work.
 *
 * Only the salon owner can open it. Customers must already exist
 * in Stripe (created on first checkout); if not, the route errors
 * with 400 and the UI prompts the user to subscribe via /checkout
 * first.
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

  const supabase = await createClient();
  const { data: salon } = await supabase
    .from("salons")
    .select("stripe_customer_id")
    .eq("id", profile.salon_id)
    .single();

  if (!salon?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No Stripe customer yet. Subscribe first to access the portal." },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: salon.stripe_customer_id,
      return_url: `${origin}/settings/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal session creation failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Portal session failed" },
      { status: 500 },
    );
  }
}
