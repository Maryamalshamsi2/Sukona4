-- migration-032-trial-period.sql
--
-- Per-salon 7-day free-trial timestamp. New salons (post-deploy) get a
-- 7-day trial automatically; existing salons stay NULL = treated as
-- already-paid / full access (no surprise lockout).
--
-- The dashboard reads this column to render a banner: "X days left in
-- your trial" while active, or "Trial ended — contact us" once expired.
-- No hard enforcement at v1 — the user can keep working past expiry; we
-- just nudge them to convert. Hard gates can be added later when a
-- billing provider is wired in.

ALTER TABLE salons ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Default applies to NEW rows ONLY (existing onboarded salons stay NULL
-- since the column was added without a default first).
ALTER TABLE salons ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '7 days');

NOTIFY pgrst, 'reload schema';
