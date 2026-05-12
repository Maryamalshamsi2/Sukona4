-- migration-034-onboarding-fields.sql
--
-- Adds the salon-profile fields captured by the multi-step onboarding
-- wizard. None of these are required for the app to function — they
-- enrich the salon record for marketing attribution (referral_source),
-- segmentation (category, team_size), localization (country), and
-- contact / public-profile use (website).
--
-- All columns are nullable text so we can add new option codes from
-- the UI without DB churn, and any pre-existing rows stay valid.

ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS team_size text,
  ADD COLUMN IF NOT EXISTS referral_source text;

NOTIFY pgrst, 'reload schema';
