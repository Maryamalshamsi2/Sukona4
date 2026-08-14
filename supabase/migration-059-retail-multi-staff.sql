-- Migration 059: multiple "Sold by" staff per retail sale.
--
-- Owners have been asking for retail sales to be attributable to
-- more than one staff member (two staff on the floor jointly close
-- a sale, or one prepped and one rang up). Before this migration
-- retail_sales.staff_id was a single-value FK; the Performance page
-- (Sales tile) credited whichever single staff was picked.
--
-- Model: join table retail_sale_staff (retail_sale_id, staff_id).
-- retail_sales.staff_id stays as a legacy mirror of the first entry
-- so pre-existing read paths (report exports, list rows that already
-- render "staff.full_name") keep working without a rewrite. New code
-- reads from the join, splits credit equally per staff.
--
-- Safe on live data: the backfill INSERTs one join row per existing
-- retail_sales row that already has a staff_id, so the DB starts
-- consistent.

CREATE TABLE IF NOT EXISTS retail_sale_staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id        uuid NOT NULL DEFAULT current_user_salon_id()
                    REFERENCES salons(id) ON DELETE CASCADE,
  retail_sale_id  uuid NOT NULL REFERENCES retail_sales(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (retail_sale_id, staff_id)
);

-- Per-sale lookup (rendering the list; splitting credit on Performance).
CREATE INDEX IF NOT EXISTS idx_retail_sale_staff_sale
  ON retail_sale_staff(retail_sale_id);
-- Per-staff month-total lookup (Performance Sales tile filter).
CREATE INDEX IF NOT EXISTS idx_retail_sale_staff_staff
  ON retail_sale_staff(staff_id);

ALTER TABLE retail_sale_staff ENABLE ROW LEVEL SECURITY;

-- Same role gate as the parent retail_sales table (owner/admin
-- only; staff sees nothing). Drop-before-create for re-runs.
DROP POLICY IF EXISTS "Owner/admin manage retail_sale_staff" ON retail_sale_staff;
CREATE POLICY "Owner/admin manage retail_sale_staff"
  ON retail_sale_staff FOR ALL TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  )
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  );

-- Backfill from existing single-value staff_id. Skip rows with no
-- attribution and rows that are somehow already covered (idempotent
-- re-run).
INSERT INTO retail_sale_staff (salon_id, retail_sale_id, staff_id)
SELECT rs.salon_id, rs.id, rs.staff_id
FROM   retail_sales rs
WHERE  rs.staff_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM retail_sale_staff rss
    WHERE  rss.retail_sale_id = rs.id
      AND  rss.staff_id       = rs.staff_id
  );

NOTIFY pgrst, 'reload schema';
