/**
 * Mapping from (plan, billing period) to the Stripe Price ID env var.
 *
 * Stripe Price IDs are per-environment (test vs live) and we keep
 * them in env vars instead of source. This module is the single
 * point that translates "Solo annual" into a `price_xxx` string,
 * so adding a new plan or billing period is one map edit + one new
 * env var, not a hunt-and-replace across routes.
 */

import type { Plan, BillingPeriod } from "@/lib/plan";

const PRICE_ENV_VARS: Record<Plan, Record<BillingPeriod, string>> = {
  solo: {
    monthly: "STRIPE_PRICE_SOLO_MONTHLY",
    annual: "STRIPE_PRICE_SOLO_ANNUAL",
  },
  team: {
    monthly: "STRIPE_PRICE_TEAM_MONTHLY",
    annual: "STRIPE_PRICE_TEAM_ANNUAL",
  },
  multi_team: {
    monthly: "STRIPE_PRICE_MULTITEAM_MONTHLY",
    annual: "STRIPE_PRICE_MULTITEAM_ANNUAL",
  },
};

export function stripePriceIdFor(plan: Plan, period: BillingPeriod): string {
  const envVar = PRICE_ENV_VARS[plan][period];
  const id = process.env[envVar];
  if (!id) {
    throw new Error(
      `Missing Stripe price ID env var "${envVar}". Set it to the price_xxx value from the Stripe dashboard.`,
    );
  }
  return id;
}
