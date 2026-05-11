-- migration-033-subscription.sql
--
-- Subscription state on each salon. Layers on top of the existing
-- trial mechanism (migration-032) — the trial is a free pre-paid
-- period; this adds the columns needed to know what plan they're
-- on, what billing cycle they're on, and how Stripe is tracking
-- them.
--
-- Defaults reflect the safest assumption for new signups:
--   plan = 'solo'           — cheapest tier, easy upgrade path
--   billing_period = 'monthly' — pick the higher monthly amount
--                              by default; users opt into annual
--   subscription_status = 'trialing' — pairs with trial_ends_at
--                                      from migration-032
--
-- Existing rows are backfilled with the same defaults via the
-- NOT NULL + DEFAULT trick. Pre-launch this is fine — all current
-- salons are test data. If we ever need a legacy/grandfather path,
-- a follow-up UPDATE can override the defaults.

ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'solo'
    CHECK (plan IN ('solo', 'team', 'multi_team')),
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'annual'));

-- Stripe lifecycle. Customer ID is the long-lived handle (one per
-- salon, created on first checkout). Subscription ID rotates if
-- the user cancels and re-subscribes. Status mirrors Stripe's own
-- subscription status enum so our app reasoning matches what the
-- webhooks tell us.
ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing','active','past_due','canceled','incomplete')),
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

-- Look-up indexes — the webhook handler will be the hot path
-- (incoming Stripe event → find the matching salon row).
CREATE INDEX IF NOT EXISTS idx_salons_stripe_customer_id
  ON salons(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_salons_stripe_subscription_id
  ON salons(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
