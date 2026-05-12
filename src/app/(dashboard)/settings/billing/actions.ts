"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth-server";
import type { Plan, BillingPeriod, SubscriptionStatus } from "@/lib/plan";

export type BillingState = {
  plan: Plan;
  billing_period: BillingPeriod;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  has_stripe_customer: boolean;
  is_owner: boolean;
};

/**
 * Fetch the current salon's billing-related fields. Mirrors the
 * columns added in migration-033-subscription.sql. Returns null
 * for unauthenticated users (and the page falls back to "Loading…"
 * before middleware redirects them away).
 */
export async function getBillingState(): Promise<BillingState | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const supabase = await createClient();
  const { data: salon } = await supabase
    .from("salons")
    .select(
      "plan, billing_period, subscription_status, trial_ends_at, current_period_end, stripe_customer_id",
    )
    .eq("id", profile.salon_id)
    .single();

  if (!salon) return null;

  return {
    plan: salon.plan as Plan,
    billing_period: salon.billing_period as BillingPeriod,
    subscription_status: salon.subscription_status as SubscriptionStatus,
    trial_ends_at: salon.trial_ends_at,
    current_period_end: salon.current_period_end,
    has_stripe_customer: !!salon.stripe_customer_id,
    is_owner: profile.role === "owner",
  };
}
