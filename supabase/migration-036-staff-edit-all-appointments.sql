-- migration-036-staff-edit-all-appointments.sql
--
-- Relaxes the appointment-edit RLS so any salon member (including
-- non-assigned staff) can update appointments and their child
-- tables. Previously these were restricted to the *assigned* staff
-- via is_assigned_staff(id), which broke real-world workflows:
--
--   - Receptionist marking paid for a colleague's appointment
--   - Staff editing an appointment to add services / reassign others
--   - One staff covering for another during a break
--
-- Audit trail is preserved via activity_log.performed_by — owners
-- can still see which user updated which appointment.
--
-- Role-based restrictions on destructive ops (cancel / no_show /
-- delete) remain in the server actions: even after this migration,
-- only owner/admin can cancel, mark no-show, or delete. The RLS
-- here just lets the UPDATE succeed for any salon member.

-- ---- APPOINTMENTS ----
-- Replace "Assigned staff can update appointments" with a broader
-- "any salon member can update" policy.
drop policy if exists "Assigned staff can update appointments in salon" on appointments;

create policy "Salon members can update appointments in salon"
  on appointments for update to authenticated
  using (salon_id = current_user_salon_id())
  with check (salon_id = current_user_salon_id());

-- ---- APPOINTMENT_SERVICES ----
-- Previously: only the assigned staff (staff_id = auth.uid()) could
-- manage rows. That broke the edit flow where staff need to delete +
-- re-insert rows for OTHER staff assignments. Replace with salon-
-- member-only check.
drop policy if exists "Assigned staff can manage own appointment_services" on appointment_services;

create policy "Salon members can manage appointment_services"
  on appointment_services for all to authenticated
  using (salon_id = current_user_salon_id())
  with check (salon_id = current_user_salon_id());

-- ---- APPOINTMENT_STAFF ----
-- Previously had NO write policy for staff at all — only owner/admin
-- could manage. That meant the appointment edit flow (which deletes +
-- re-inserts appointment_staff rows when reassigning) would silently
-- fail for staff. Add a salon-member-level policy.
create policy "Salon members can manage appointment_staff"
  on appointment_staff for all to authenticated
  using (salon_id = current_user_salon_id())
  with check (salon_id = current_user_salon_id());

NOTIFY pgrst, 'reload schema';
