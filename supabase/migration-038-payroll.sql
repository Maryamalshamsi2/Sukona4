-- migration-038-payroll.sql
--
-- Payroll v1 — track tips, bonuses, deductions, and commission so the
-- owner can produce a per-staff monthly salary breakdown.
--
-- Data model
-- ----------
--   payments
--     + tip_amount numeric default 0   — tip on this payment
--     + tip_to_staff_id uuid           — explicit attribution, NULL = split
--                                        equally across staff on the appt
--   profiles
--     + commission_percent numeric default 0  — % of services revenue
--                                               the staff member did
--     (salary already exists from migration-002 — reused as the
--      monthly base; can be 0 for commission-only staff)
--
--   staff_adjustments (new)            — manual bonuses / deductions
--     id, salon_id, staff_id, type ('bonus'|'deduction'),
--     amount, reason, adjustment_date, created_by, created_at
--
-- The monthly payable for a staff member becomes:
--
--   base_salary
--   + (services_revenue × commission_percent / 100)
--   + tips_received
--   + Σ bonuses
--   − Σ deductions
--
-- Services revenue is already derivable from existing tables
-- (appointment_services.staff_id × services.price filtered by
-- payments.created_at in the month). No denormalisation needed for v1.

-- ---------- payments ----------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tip_amount numeric(10, 2) NOT NULL DEFAULT 0
    CHECK (tip_amount >= 0),
  ADD COLUMN IF NOT EXISTS tip_to_staff_id uuid REFERENCES profiles(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_tip_to_staff_id
  ON payments(tip_to_staff_id)
  WHERE tip_to_staff_id IS NOT NULL;

-- ---------- profiles ----------
-- commission_percent: 0..100 (NOT 0..1) so the UI value matches the
-- stored value with no conversion. A staff on 30% commission stores 30.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5, 2) NOT NULL DEFAULT 0
    CHECK (commission_percent >= 0 AND commission_percent <= 100);

-- ---------- staff_adjustments ----------
CREATE TABLE IF NOT EXISTS staff_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('bonus', 'deduction')),
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  reason text NOT NULL,
  adjustment_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hot read path: "all adjustments for this staff in this month."
CREATE INDEX IF NOT EXISTS idx_staff_adjustments_staff_date
  ON staff_adjustments(staff_id, adjustment_date DESC);

CREATE INDEX IF NOT EXISTS idx_staff_adjustments_salon_date
  ON staff_adjustments(salon_id, adjustment_date DESC);

-- RLS — payroll is owner-only at the data layer. Even if the UI were
-- bypassed, an admin or staff member querying directly would see
-- nothing. We also rely on the server actions to re-check `role`
-- before any insert, but defense in depth lives here.
--
-- DROP IF EXISTS before each CREATE POLICY — `CREATE POLICY` is not
-- idempotent in Postgres (no `IF NOT EXISTS` variant), so without
-- the drops a re-run errors with 42710. Dropping a non-existent
-- policy is a no-op, so this is safe on a first run too.
ALTER TABLE staff_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view staff adjustments" ON staff_adjustments;
CREATE POLICY "Owner can view staff adjustments"
  ON staff_adjustments FOR SELECT TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "Owner can insert staff adjustments" ON staff_adjustments;
CREATE POLICY "Owner can insert staff adjustments"
  ON staff_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "Owner can delete staff adjustments" ON staff_adjustments;
CREATE POLICY "Owner can delete staff adjustments"
  ON staff_adjustments FOR DELETE TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

DROP POLICY IF EXISTS "Owner can update staff adjustments" ON staff_adjustments;
CREATE POLICY "Owner can update staff adjustments"
  ON staff_adjustments FOR UPDATE TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

NOTIFY pgrst, 'reload schema';
