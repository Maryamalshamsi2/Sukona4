-- migration-043-retail-sales.sql
--
-- Standalone retail sales — products (shampoos, tools), walk-in
-- merchandise, gift card redemptions, etc. — that don't go through
-- the calendar/appointment flow.
--
-- This is "phase 1" of a broader sales-feature plan:
--   Phase 1 (this migration):  Direct retail sales, count as revenue
--                              immediately. No code/balance tracking.
--   Phase 2 (future):          Proper gift-card flow — codes,
--                              balances, revenue recognized at
--                              redemption rather than at sale time.
--                              Will add a gift_cards table + integrate
--                              with the payment modal.
--
-- For now, the simplest possible model:
--   - One row per sale
--   - Description (free text), amount, payment method
--   - Optional client (walk-ins are common)
--   - Optional staff (who rang it up)
--   - sale_date (defaults to today)
--
-- Owner + admin only at the RLS layer. Staff don't see this table at
-- all — matching the user's choice to keep retail revenue private to
-- management. salon_id auto-fills via the column default that
-- migration-014 wires up across all tenant tables.

CREATE TABLE IF NOT EXISTS retail_sales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount      numeric(10, 2) NOT NULL CHECK (amount > 0),
  method      text NOT NULL CHECK (method IN ('cash', 'card', 'other')),
  sale_date   date NOT NULL DEFAULT CURRENT_DATE,
  client_id   uuid REFERENCES clients(id) ON DELETE SET NULL,
  staff_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes       text,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Hot read path: "what sales happened in this date window for this salon?"
CREATE INDEX IF NOT EXISTS idx_retail_sales_salon_date
  ON retail_sales(salon_id, sale_date DESC);

ALTER TABLE retail_sales ENABLE ROW LEVEL SECURITY;

-- One combined ALL policy — staff get zero visibility, owner+admin
-- get full CRUD. The user explicitly asked for staff to be excluded.
-- Drop-before-create for re-run safety (CREATE POLICY isn't
-- idempotent in Postgres).
DROP POLICY IF EXISTS "Owner/admin manage retail_sales" ON retail_sales;
CREATE POLICY "Owner/admin manage retail_sales"
  ON retail_sales FOR ALL TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  )
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  );

NOTIFY pgrst, 'reload schema';
