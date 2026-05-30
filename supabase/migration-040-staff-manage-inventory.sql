-- migration-040-staff-manage-inventory.sql
--
-- Relax inventory RLS so any salon member (including staff) can
-- manage inventory rows — add, edit, adjust quantities, delete.
-- Previously this was owner/admin only, which broke real workflows:
--
--   - Staff finishes the last bottle of a product → wants to add it
--     to inventory so the owner knows to reorder
--   - Staff uses 2 units during an appointment → wants to knock the
--     quantity down without pinging the owner
--
-- Audit trail is preserved via activity_log.performed_by — the owner
-- can still see who added / changed / deleted what (the
-- updateInventoryItem and updateInventoryQuantity actions already
-- log a row per quantity change).
--
-- DROP IF EXISTS before each CREATE POLICY so the migration is
-- idempotent (re-runs cleanly without 42710 errors).

-- ---- INVENTORY ----
DROP POLICY IF EXISTS "Owner/admin can manage inventory" ON inventory;
DROP POLICY IF EXISTS "Salon members can manage inventory" ON inventory;

CREATE POLICY "Salon members can manage inventory"
  ON inventory FOR ALL TO authenticated
  USING (salon_id = current_user_salon_id())
  WITH CHECK (salon_id = current_user_salon_id());

NOTIFY pgrst, 'reload schema';
