-- migration-045-appointment-no-show-status.sql
--
-- Widen the appointments.status CHECK constraint to include 'no_show'.
--
-- The "No-show" UI affordance has been in the app code for a while
-- (status badge in calendar/home/clients, the "← No-show" button in
-- the appointment detail drawer, Reports filter, /payroll exclusion)
-- but the underlying DB constraint from setup.sql only allowed
-- scheduled/on_the_way/arrived/completed/paid/cancelled. Result: a
-- staff or owner clicking "No-show" hit a CHECK constraint violation
-- with no path to actually mark the appointment as no-show.
--
-- The fix is idempotent: drop-if-exists, then re-add. Safe to re-run.

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN (
    'scheduled', 'on_the_way', 'arrived', 'completed',
    'paid', 'cancelled', 'no_show'
  ));

NOTIFY pgrst, 'reload schema';
