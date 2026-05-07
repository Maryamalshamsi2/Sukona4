-- ============================================
-- MIGRATION 024: appointment adjustments
--
-- Adds three optional fields per appointment so owners can:
--   1. Add a flat transportation charge
--   2. Apply a discount (percentage OR fixed AED)
--   3. Manually override the final total when neither of the above
--      cleanly captures what they want to charge
--
-- All defaults preserve the previous "total = sum of services" behavior
-- so existing rows are unaffected.
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

alter table appointments
  add column if not exists transportation_charge numeric(10, 2) not null default 0,
  add column if not exists discount_type text default 'fixed',
  add column if not exists discount_value numeric(10, 2) not null default 0,
  add column if not exists total_override numeric(10, 2);

-- Constrain discount_type to the two supported modes. Drop-and-recreate
-- so the migration is idempotent across re-runs.
alter table appointments drop constraint if exists appointments_discount_type_check;
alter table appointments
  add constraint appointments_discount_type_check
  check (discount_type in ('percentage', 'fixed'));

-- Sanity: discount values + transport must be non-negative; override
-- (when set) must also be non-negative.
alter table appointments drop constraint if exists appointments_transportation_charge_check;
alter table appointments
  add constraint appointments_transportation_charge_check
  check (transportation_charge >= 0);

alter table appointments drop constraint if exists appointments_discount_value_check;
alter table appointments
  add constraint appointments_discount_value_check
  check (discount_value >= 0);

alter table appointments drop constraint if exists appointments_total_override_check;
alter table appointments
  add constraint appointments_total_override_check
  check (total_override is null or total_override >= 0);

notify pgrst, 'reload schema';

commit;
