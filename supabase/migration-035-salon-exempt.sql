-- migration-035-salon-exempt.sql
--
-- Adds an explicit "this salon is exempt from billing" flag on
-- salons. When true:
--   - Middleware never hard-blocks the salon (trial expiry,
--     subscription past_due / canceled all bypassed).
--   - Trial banner doesn't render (no "X days left" countdown).
--   - subscription_status / trial_ends_at / current_period_end
--     remain accurate to what Stripe says (or defaults if no
--     Stripe customer); the flag is independent.
--
-- Use cases:
--   - Founder / staff using their own product without paying
--   - Demo / sales accounts
--   - Long-term partner accounts
--   - Test salons in production
--
-- Default false (existing salons keep paying). Flip per-salon
-- with: UPDATE salons SET is_exempt = true WHERE id = '...';

ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS is_exempt boolean NOT NULL DEFAULT false;

-- Tell PostgREST to reload the schema so the new column is
-- queryable through the REST API immediately (no Supabase
-- restart required).
NOTIFY pgrst, 'reload schema';
