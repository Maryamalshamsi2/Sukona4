-- migration-030-salon-currency.sql
--
-- Per-salon currency setting so the app isn't AED-only.
--
-- Stored as the ISO 4217 code on the salons row. The app uses the
-- code itself as the display label (e.g. "AED 100", "SAR 100",
-- "USD 100"), no symbol mapping needed for v1.
--
-- Default 'AED' so existing UAE salons keep their current behavior
-- without any data migration. New salons can pick during onboarding;
-- owners can change later from Settings.

ALTER TABLE salons
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'AED';

NOTIFY pgrst, 'reload schema';
