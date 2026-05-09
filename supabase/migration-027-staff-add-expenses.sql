-- migration-027-staff-add-expenses.sql
--
-- Let staff log expenses.
--
-- Migration 014 wrote a single "Owner/admin can manage expenses" policy
-- with FOR ALL — which blocked staff from inserting too. But the app
-- expects staff to record expenses they incur on the job (taxi to a
-- home-service appointment, supplies they purchased, etc.) — the
-- expenses page is reachable from the bottom tab bar for every role,
-- and the form's "Private" toggle is staff-relevant.
--
-- Symptom: staff get
--   "new row violates row-level security policy for table 'expenses'"
-- when submitting the new-expense form.
--
-- Fix: split the FOR ALL policy into separate INSERT / UPDATE / DELETE
-- policies. INSERT is now allowed for any authenticated salon member;
-- UPDATE and DELETE stay restricted to owner/admin so staff can't edit
-- or remove entries (theirs or anyone else's).
--
-- salon_id defaults to current_user_salon_id() at the column level
-- (set up in migration 014's loop), so staff inserts pick up the right
-- tenant automatically.

drop policy if exists "Owner/admin can manage expenses" on expenses;

create policy "Salon members can record expenses"
  on expenses for insert to authenticated
  with check (salon_id = current_user_salon_id());

create policy "Owner/admin can update expenses"
  on expenses for update to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

create policy "Owner/admin can delete expenses"
  on expenses for delete to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin());

notify pgrst, 'reload schema';
