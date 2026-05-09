-- migration-028-expense-creator-and-private-notifications.sql
--
-- Two related fixes:
--
-- 1. Staff should be able to update + delete the expenses THEY created,
--    but not anyone else's. Migration 027 opened insert; this adds a
--    created_by column (defaulted to auth.uid() at the DB level so
--    server actions don't have to set it) and re-scopes the
--    update/delete policies to "owner/admin OR creator".
--
-- 2. Notifications about *private* expenses should not reach staff.
--    Add an is_private flag to activity_log so the row carries the
--    sensitivity bit forward; the notification bell + home activity
--    feed filter it out for staff at read time.

-- ---- 1. expenses.created_by ----

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Default new rows to the calling user. Existing rows stay NULL —
-- which means staff can't update/delete them retroactively, only
-- owner/admin can. That's the right behavior; the rows pre-date the
-- "track who created this" policy so we have no signal to grant edit
-- access.
ALTER TABLE expenses
  ALTER COLUMN created_by SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS expenses_created_by_idx ON expenses(created_by);

DROP POLICY IF EXISTS "Owner/admin can update expenses" ON expenses;
DROP POLICY IF EXISTS "Owner/admin can delete expenses" ON expenses;

CREATE POLICY "Update own expense or owner/admin can update any"
  ON expenses FOR UPDATE TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND (is_owner_or_admin() OR created_by = auth.uid())
  )
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND (is_owner_or_admin() OR created_by = auth.uid())
  );

CREATE POLICY "Delete own expense or owner/admin can delete any"
  ON expenses FOR DELETE TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND (is_owner_or_admin() OR created_by = auth.uid())
  );

-- ---- 2. activity_log.is_private ----

ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
