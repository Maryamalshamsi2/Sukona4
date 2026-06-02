-- migration-041-cascade-on-profile-delete.sql
--
-- Fix "Database error deleting user" when removing a team member.
--
-- Two foreign keys to `profiles` were defined without an ON DELETE
-- clause, which defaults to NO ACTION — meaning the delete is
-- BLOCKED whenever those tables still have rows referring to the
-- user being removed:
--
--   1. activity_log.performed_by  (migration-005)
--   2. petty_cash_log.created_by  (migration-009)
--
-- Both should be ON DELETE SET NULL: we want to keep the audit row
-- (it's history — what happened, when), we just lose attribution
-- to the now-departed user.
--
-- We drop the existing constraint by name (Postgres auto-names it
-- "<table>_<column>_fkey" when one isn't specified) and re-add it
-- with the correct cascade.

-- ---- activity_log.performed_by ----
ALTER TABLE activity_log
  DROP CONSTRAINT IF EXISTS activity_log_performed_by_fkey;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ---- petty_cash_log.created_by ----
ALTER TABLE petty_cash_log
  DROP CONSTRAINT IF EXISTS petty_cash_log_created_by_fkey;

ALTER TABLE petty_cash_log
  ADD CONSTRAINT petty_cash_log_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
