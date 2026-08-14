-- Migration 058: monthly performance reviews.
--
-- Owner/admin writes free-text notes about each staff member for a
-- given month; the page also shows an auto-computed metric snapshot
-- (appointments completed, revenue attributed, tips received,
-- no-shows / cancels) pulled from existing tables — no new data
-- collection needed. One row per (staff, month); revisiting the same
-- month upserts.
--
-- Owner + admin only. Staff cannot read their own reviews for now;
-- if we add a self-view later, that's a policy widening, not a schema
-- change.

CREATE TABLE IF NOT EXISTS performance_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id    uuid NOT NULL DEFAULT current_user_salon_id()
                REFERENCES salons(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- YYYY-MM. Text, not date, so callers don't have to invent a
  -- day-of-month. Format enforced by the CHECK so bad inputs don't
  -- silently accumulate.
  month       text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  notes       text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, staff_id, month)
);

ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner/admin manage performance_reviews" ON performance_reviews;
CREATE POLICY "Owner/admin manage performance_reviews"
  ON performance_reviews FOR ALL TO authenticated
  USING (salon_id = current_user_salon_id() AND is_owner_or_admin())
  WITH CHECK (salon_id = current_user_salon_id() AND is_owner_or_admin());

-- Page load fetches "every review this salon has for month M" in one
-- go; the composite covers it.
CREATE INDEX IF NOT EXISTS idx_reviews_salon_month
  ON performance_reviews(salon_id, month);

-- updated_at bumps on every write. Small trigger — nothing else
-- depends on it, but it's the standard courtesy.
CREATE OR REPLACE FUNCTION set_performance_reviews_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_performance_reviews_updated_at ON performance_reviews;
CREATE TRIGGER trg_performance_reviews_updated_at
  BEFORE UPDATE ON performance_reviews
  FOR EACH ROW EXECUTE FUNCTION set_performance_reviews_updated_at();

NOTIFY pgrst, 'reload schema';
