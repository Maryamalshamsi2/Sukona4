-- migration-047-client-locations.sql
--
-- Multi-location clients. A client can now have many addresses
-- (Home / Office / a wedding venue / vacation home / ...) instead
-- of one. Each appointment links to a specific location row.
--
-- Why it matters:
--   1. Real salon need — bridal at the venue + regulars at home; VIP
--      clients with multiple homes (Dubai + Abu Dhabi).
--   2. Fixes a historical-record bug — today, reading
--      appointments.clients.address shows the client's CURRENT
--      address even for appointments that happened months ago at
--      a different address. With appointments.location_id pinning
--      to a specific location row at booking time, past appointments
--      stay accurate.
--
-- Two changes:
--   - new client_locations table (one row per saved location)
--   - new appointments.location_id FK
--
-- The original clients.address + clients.map_link columns are KEPT
-- (legacy mirror of the default location for read backward-compat
-- during the rollout). New code reads location_id; old reading sites
-- can be migrated one at a time. Nothing breaks day one.

-- ============================================
-- client_locations
-- ============================================

CREATE TABLE IF NOT EXISTS client_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- See migration-044 comment for why we DEFAULT this here.
  salon_id    uuid NOT NULL DEFAULT current_user_salon_id()
                REFERENCES salons(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Free-text label per the owner's choice. Empty allowed — picker
  -- falls back to showing the address string when label is blank.
  label       text NOT NULL DEFAULT '',
  address     text,
  map_link    text,
  -- Exactly one default per client is enforced by the partial
  -- unique index below.
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Enforce: at most one default row per client.
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_locations_one_default
  ON client_locations(client_id)
  WHERE is_default = true;

-- Hot read path: list a client's locations for the appointment-form
-- picker.
CREATE INDEX IF NOT EXISTS idx_client_locations_client
  ON client_locations(client_id, created_at DESC);

ALTER TABLE client_locations ENABLE ROW LEVEL SECURITY;

-- Owner/admin: full CRUD on their salon's location rows. Staff
-- (matches clients table policy): SELECT only — they need it for
-- the appointment-form picker but can't add/edit/remove locations.
DROP POLICY IF EXISTS "Owner/admin manage client_locations" ON client_locations;
CREATE POLICY "Owner/admin manage client_locations"
  ON client_locations FOR ALL TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  )
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  );

DROP POLICY IF EXISTS "Authenticated read client_locations" ON client_locations;
CREATE POLICY "Authenticated read client_locations"
  ON client_locations FOR SELECT TO authenticated
  USING (salon_id = current_user_salon_id());

-- ============================================
-- appointments.location_id
-- ============================================
-- ON DELETE SET NULL: if a location is deleted, the appointment
-- stays (matches the convention used for staff_id on
-- appointment_services). Reading code falls back to the legacy
-- clients.address / clients.map_link until the rollout is complete.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES client_locations(id) ON DELETE SET NULL;

-- Backfill needs an index for the SET clause below; also useful for
-- future per-location reports queries.
CREATE INDEX IF NOT EXISTS idx_appointments_location
  ON appointments(location_id) WHERE location_id IS NOT NULL;

-- ============================================
-- Backfill: existing clients → "Home" default location
-- ============================================
-- Insert one row per client that has a non-null address OR a
-- non-null map_link. Clients with neither stay as-is (they'll get
-- their first location the next time a staff books for them).
INSERT INTO client_locations (salon_id, client_id, label, address, map_link, is_default)
SELECT salon_id, id, 'Home', address, map_link, true
FROM clients
WHERE
  (address IS NOT NULL OR map_link IS NOT NULL)
  AND NOT EXISTS (
    -- Re-run safety: skip clients that already have a default row.
    SELECT 1 FROM client_locations cl
    WHERE cl.client_id = clients.id AND cl.is_default = true
  );

-- ============================================
-- Backfill: existing appointments → their client's default location
-- ============================================
UPDATE appointments a
SET location_id = (
  SELECT id FROM client_locations cl
  WHERE cl.client_id = a.client_id AND cl.is_default = true
  LIMIT 1
)
WHERE a.location_id IS NULL
  AND a.client_id IS NOT NULL
  -- Only set if a default location actually exists for this client.
  AND EXISTS (
    SELECT 1 FROM client_locations cl
    WHERE cl.client_id = a.client_id AND cl.is_default = true
  );

NOTIFY pgrst, 'reload schema';
