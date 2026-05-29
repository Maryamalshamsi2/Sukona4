-- migration-039-payroll-target.sql
--
-- Threshold commission — each staff has a monthly target equal to
-- `salary × target_multiplier`, and commission is paid only on the
-- portion of services revenue ABOVE that target.
--
--   target     = salary × target_multiplier
--   excess     = max(0, services_revenue − target)
--   commission = excess × commission_percent / 100
--
-- target_multiplier defaults to 0 so existing salons see no change
-- in behavior after this migration: target = salary × 0 = 0, so
-- excess = services_revenue, and commission collapses back to the
-- old "% of total revenue" formula. Owners opt into the threshold
-- model by setting a non-zero multiplier per staff.
--
-- Why a multiplier and not an absolute target amount?
--   - Auto-tracks raises: bumping salary automatically raises the
--     target, so the owner doesn't have to remember two fields.
--   - Cleaner mental model in salons: "she's on a 3× target."
--   - One less number to maintain per staff per month.
--
-- The cap at 50 is just a sanity check — a multiplier above ~10 is
-- already unusual (would mean target is 10× monthly salary), and
-- anything > 50 is almost certainly a fat-finger input.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS target_multiplier numeric(5, 2) NOT NULL DEFAULT 0
    CHECK (target_multiplier >= 0 AND target_multiplier <= 50);

NOTIFY pgrst, 'reload schema';
