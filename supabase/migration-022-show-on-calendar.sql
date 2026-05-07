-- ============================================
-- MIGRATION 022: profiles.appears_on_calendar
--
-- Owners can flag staff members as "calendar-only" or "off-calendar".
-- Off-calendar staff (drivers, managers, receptionists) still log in
-- and see appointments via the staff role + RLS, but they don't appear
-- as a column on the calendar grid or in the assignable-staff dropdown
-- when booking an appointment. Default true so existing staff are
-- unaffected.
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

alter table profiles
  add column if not exists appears_on_calendar boolean not null default true;

-- Backfill any existing rows that somehow have NULL (shouldn't happen
-- with the NOT NULL DEFAULT, but defensive).
update profiles
   set appears_on_calendar = true
 where appears_on_calendar is null;

notify pgrst, 'reload schema';

commit;
