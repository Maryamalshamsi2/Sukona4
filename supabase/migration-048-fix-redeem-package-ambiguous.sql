-- Migration 048: fix "column reference 'sessions_used' is ambiguous"
-- in redeem_package_session.
--
-- The original RPC (migration-046-packages.sql) declares
-- `RETURNS TABLE (... sessions_used integer, ...)`. Postgres treats
-- those output columns as variables inside the function body. So an
-- unqualified `sessions_used` in any SQL statement inside the body
-- has TWO candidates — the output variable and
-- `package_items.sessions_used` — and Postgres refuses to guess.
--
-- The error fires the first time a SELECT or UPDATE in the body
-- references `sessions_used` without a table prefix. UI symptom:
-- "Mark as Paid" with a package redemption shows the raw
-- "column reference 'sessions_used' is ambiguous" toast.
--
-- Fix: keep the public signature identical (callers still read
-- row.sessions_used) and qualify every internal reference with
-- the `package_items.` prefix.

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
  -- All column refs prefixed with package_items.* to disambiguate
  -- against the RETURNS TABLE output column of the same name.
  SELECT package_items.id,
         package_items.package_id,
         package_items.sessions_total,
         package_items.sessions_used
    INTO v_item
    FROM package_items
    WHERE package_items.id = p_package_item_id
    FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Package item not found';
  END IF;

  SELECT packages.id, packages.salon_id, packages.status, packages.expires_at
    INTO v_pkg
    FROM packages
    WHERE packages.id = v_item.package_id;

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

  -- Use v_item.* on the RHS so neither side is unqualified.
  UPDATE package_items
    SET sessions_used = v_item.sessions_used + 1
    WHERE package_items.id = v_item.id;

  INSERT INTO package_redemptions (
    salon_id, package_id, package_item_id,
    appointment_id, notes, created_by
  )
  VALUES (
    v_pkg.salon_id, v_pkg.id, v_item.id,
    p_appointment_id, p_notes, auth.uid()
  )
  RETURNING id INTO v_redemption_id;

  SELECT SUM(package_items.sessions_total - package_items.sessions_used)
    INTO v_total_remaining
    FROM package_items
    WHERE package_items.package_id = v_pkg.id;

  IF v_total_remaining = 0 THEN
    UPDATE packages SET status = 'completed' WHERE packages.id = v_pkg.id;
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

-- Grants are unchanged from migration-046, but re-apply defensively
-- in case the function was dropped/recreated outside this migration.
REVOKE ALL ON FUNCTION redeem_package_session(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_package_session(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
