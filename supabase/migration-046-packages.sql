-- migration-046-packages.sql
--
-- Multi-session service packages. A "package" is something a customer
-- pays for upfront and consumes over multiple future appointments:
--   - "5 Basic Manicures" — single service, 5 sessions
--   - "Spa Day: 3 mani + 3 pedi + 1 facial" — mixed bundle, per-service counts
--   - Can be a gift (buyer ≠ recipient)
--
-- Revenue model is the same as gift cards (migration-044): cash hits
-- the till on sale day, recognized as revenue then. Redemption days
-- consume sessions but don't add revenue (otherwise we'd double-count
-- the same money).
--
-- Three tables:
--   packages              — parent record (buyer, recipient, status,
--                           total paid, expiry, purchase_method)
--   package_items         — one row per service-line; stores
--                           sessions_total + sessions_used so a single
--                           or mixed package shares the same schema
--   package_redemptions   — append-only log of each session use,
--                           optionally linked to an appointment
--
-- RLS shape (matches gift cards):
--   packages / package_items:
--     - owner/admin: full CRUD on their salon's rows
--     - staff:       SELECT only (need to see what's available at
--                    Mark-as-Paid time)
--     - session count changes go ONLY through redeem_package_session()
--       SECURITY DEFINER — staff don't get direct UPDATE
--   package_redemptions:
--     - owner/admin: full CRUD
--     - staff:       SELECT, INSERT (only via the RPC's runtime)

-- ============================================
-- packages
-- ============================================

CREATE TABLE IF NOT EXISTS packages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- See migration-044's comment for why this DEFAULT matters.
  salon_id              uuid NOT NULL DEFAULT current_user_salon_id()
                          REFERENCES salons(id) ON DELETE CASCADE,
  -- Buyer is who paid; recipient is who uses the sessions. They're
  -- the same person for most sales, but split when the package is a
  -- gift. Recipient is required because redemption lookups key off
  -- the client at the appointment.
  buyer_client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  recipient_client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'completed', 'void')),
  -- 'completed' = every item's sessions fully used (auto-flipped by
  -- the redeem RPC when the last session drains)
  -- 'void' = cancelled by owner; no money movement
  total_paid            numeric(10, 2) NOT NULL CHECK (total_paid >= 0),
  purchase_method       text NOT NULL DEFAULT 'cash'
                          CHECK (purchase_method IN ('cash', 'card', 'other')),
  expires_at            date,
  notes                 text,
  created_by            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- package_items
-- ============================================

CREATE TABLE IF NOT EXISTS package_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id      uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  -- RESTRICT (not SET NULL) — we don't want to silently lose the
  -- link to which service this item is for. If a service needs to
  -- be deleted, owners must first void/delete the packages using it.
  service_id      uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  sessions_total  integer NOT NULL CHECK (sessions_total > 0),
  sessions_used   integer NOT NULL DEFAULT 0
                    CHECK (sessions_used >= 0 AND sessions_used <= sessions_total)
);

-- ============================================
-- package_redemptions
-- ============================================

CREATE TABLE IF NOT EXISTS package_redemptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id          uuid NOT NULL DEFAULT current_user_salon_id()
                      REFERENCES salons(id) ON DELETE CASCADE,
  package_id        uuid NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  package_item_id   uuid NOT NULL REFERENCES package_items(id) ON DELETE CASCADE,
  appointment_id    uuid REFERENCES appointments(id) ON DELETE SET NULL,
  notes             text,
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Indexes — hot read paths
-- ============================================

-- "What packages does this client have?" — driven by recipient_client_id
-- when MarkPaidModal opens for an appointment.
CREATE INDEX IF NOT EXISTS idx_packages_recipient
  ON packages(salon_id, recipient_client_id, status);

-- List page filters by status:
CREATE INDEX IF NOT EXISTS idx_packages_salon_status
  ON packages(salon_id, status, created_at DESC);

-- Per-package item lookup:
CREATE INDEX IF NOT EXISTS idx_package_items_package
  ON package_items(package_id);

-- Redemption history (detail panel + Reports):
CREATE INDEX IF NOT EXISTS idx_package_redemptions_package
  ON package_redemptions(package_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_package_redemptions_salon_date
  ON package_redemptions(salon_id, created_at DESC);

-- ============================================
-- RLS
-- ============================================

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_redemptions ENABLE ROW LEVEL SECURITY;

-- packages: owner/admin full CRUD; staff SELECT.
DROP POLICY IF EXISTS "Owner/admin manage packages" ON packages;
CREATE POLICY "Owner/admin manage packages"
  ON packages FOR ALL TO authenticated
  USING (salon_id = current_user_salon_id() AND is_owner_or_admin())
  WITH CHECK (salon_id = current_user_salon_id() AND is_owner_or_admin());

DROP POLICY IF EXISTS "Staff read packages" ON packages;
CREATE POLICY "Staff read packages"
  ON packages FOR SELECT TO authenticated
  USING (salon_id = current_user_salon_id());

-- package_items: owner/admin full CRUD; staff SELECT.
DROP POLICY IF EXISTS "Owner/admin manage package_items" ON package_items;
CREATE POLICY "Owner/admin manage package_items"
  ON package_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = package_items.package_id
        AND p.salon_id = current_user_salon_id()
    )
    AND is_owner_or_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = package_items.package_id
        AND p.salon_id = current_user_salon_id()
    )
    AND is_owner_or_admin()
  );

DROP POLICY IF EXISTS "Staff read package_items" ON package_items;
CREATE POLICY "Staff read package_items"
  ON package_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM packages p
      WHERE p.id = package_items.package_id
        AND p.salon_id = current_user_salon_id()
    )
  );

-- package_redemptions: owner/admin full CRUD; staff SELECT + insert
-- (insert path goes through the SECURITY DEFINER RPC anyway, so the
-- staff INSERT policy is a defense-in-depth allowance, not the
-- primary path).
DROP POLICY IF EXISTS "Owner/admin manage package_redemptions" ON package_redemptions;
CREATE POLICY "Owner/admin manage package_redemptions"
  ON package_redemptions FOR ALL TO authenticated
  USING (salon_id = current_user_salon_id() AND is_owner_or_admin())
  WITH CHECK (salon_id = current_user_salon_id() AND is_owner_or_admin());

DROP POLICY IF EXISTS "Staff read package_redemptions" ON package_redemptions;
CREATE POLICY "Staff read package_redemptions"
  ON package_redemptions FOR SELECT TO authenticated
  USING (salon_id = current_user_salon_id());

DROP POLICY IF EXISTS "Staff insert package_redemptions" ON package_redemptions;
CREATE POLICY "Staff insert package_redemptions"
  ON package_redemptions FOR INSERT TO authenticated
  WITH CHECK (salon_id = current_user_salon_id());

-- ============================================
-- redeem_package_session(): only path that mutates package_items.sessions_used
-- ============================================
--
-- SECURITY DEFINER so staff can decrement without direct UPDATE on
-- package_items. The function:
--   - Locks the package_item row (FOR UPDATE) to prevent
--     double-consume races
--   - Enforces same-salon, parent package is 'active', expiry
--     hasn't passed, sessions_used < sessions_total
--   - Increments sessions_used by 1
--   - If that drains the LAST item across the whole package, flips
--     the parent packages.status to 'completed'
--   - Logs a package_redemptions row
-- Returns the new sessions_used + whether the package was completed.

CREATE OR REPLACE FUNCTION redeem_package_session(
  p_package_item_id   uuid,
  p_appointment_id    uuid DEFAULT NULL,
  p_notes             text DEFAULT NULL
)
RETURNS TABLE (
  redemption_id          uuid,
  sessions_used          integer,
  sessions_remaining     integer,
  package_completed      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item            record;
  v_pkg             record;
  v_user_salon      uuid;
  v_redemption_id   uuid;
  v_total_remaining integer;
  v_completed       boolean := false;
BEGIN
  v_user_salon := current_user_salon_id();
  IF v_user_salon IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock the item row to prevent race-condition double-redeem.
  SELECT id, package_id, sessions_total, sessions_used
    INTO v_item
    FROM package_items
    WHERE id = p_package_item_id
    FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Package item not found';
  END IF;

  -- Fetch parent package for tenancy + status + expiry checks.
  SELECT id, salon_id, status, expires_at
    INTO v_pkg
    FROM packages
    WHERE id = v_item.package_id;

  IF v_pkg.salon_id <> v_user_salon THEN
    RAISE EXCEPTION 'Package not found';
  END IF;

  IF v_pkg.status <> 'active' THEN
    RAISE EXCEPTION 'Package is %', v_pkg.status;
  END IF;

  IF v_pkg.expires_at IS NOT NULL AND v_pkg.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Package expired on %', v_pkg.expires_at;
  END IF;

  IF v_item.sessions_used >= v_item.sessions_total THEN
    RAISE EXCEPTION 'No sessions remaining for this item';
  END IF;

  -- Increment session count.
  UPDATE package_items
    SET sessions_used = sessions_used + 1
    WHERE id = v_item.id;

  -- Log the redemption.
  INSERT INTO package_redemptions (
    salon_id, package_id, package_item_id,
    appointment_id, notes, created_by
  )
  VALUES (
    v_pkg.salon_id, v_pkg.id, v_item.id,
    p_appointment_id, p_notes, auth.uid()
  )
  RETURNING id INTO v_redemption_id;

  -- If every item on this package is now fully used, flip the
  -- parent package to 'completed'.
  SELECT SUM(sessions_total - sessions_used)
    INTO v_total_remaining
    FROM package_items
    WHERE package_id = v_pkg.id;

  IF v_total_remaining = 0 THEN
    UPDATE packages SET status = 'completed' WHERE id = v_pkg.id;
    v_completed := true;
  END IF;

  RETURN QUERY
    SELECT
      v_redemption_id,
      v_item.sessions_used + 1,
      v_item.sessions_total - (v_item.sessions_used + 1),
      v_completed;
END;
$$;

REVOKE ALL ON FUNCTION redeem_package_session(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_package_session(uuid, uuid, text) TO authenticated;

-- ============================================
-- Widen payments.method to accept 'package'
-- ============================================
-- A package-redemption appointment can still write a payments row
-- (for receipt/history) with method='package'. Reports excludes
-- those rows from revenue (cash was already counted at sale time).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'card', 'other', 'gift_card', 'package'));

NOTIFY pgrst, 'reload schema';
