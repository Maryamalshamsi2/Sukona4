-- migration-025-bundle-tracking.sql
--
-- Track bundle association on appointment_services rows.
--
-- Before this migration, bundle pricing only lived in the form's React
-- state and was lost on save. Two consequences:
--   1) Editing an appointment that was created with a bundle re-loaded the
--      services as raw rows; adding a second copy of the same bundle then
--      mixed bundle pricing with raw service pricing in the total.
--   2) Adding two copies of the same bundle to a fresh appointment caused
--      the dedup-by-bundle-id calc to count only one of them.
--
-- Three new columns:
--   - bundle_id          which bundle this row came from (nullable; legacy
--                        rows stay NULL and behave as before)
--   - bundle_instance_id per-add UUID. Two copies of the same bundle on
--                        one appointment have different instance IDs so
--                        they're independent for pricing + remove.
--   - bundle_total_price snapshot of the bundle's effective price at save
--                        time. One row per instance carries the full
--                        amount; the others are 0 and the subtotal calc
--                        dedups by instance.

ALTER TABLE appointment_services
  ADD COLUMN IF NOT EXISTS bundle_id uuid REFERENCES service_bundles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bundle_instance_id uuid,
  ADD COLUMN IF NOT EXISTS bundle_total_price numeric(10, 2),
  -- Snapshot of the bundle name at save time so the appointment keeps a
  -- stable label even if the catalog bundle is later renamed or deleted.
  ADD COLUMN IF NOT EXISTS bundle_name text;

CREATE INDEX IF NOT EXISTS idx_appointment_services_bundle_instance
  ON appointment_services(bundle_instance_id);

NOTIFY pgrst, 'reload schema';
