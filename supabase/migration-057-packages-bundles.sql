-- Migration 057: allow package_items to target a bundle instead of a service.
--
-- Owners have been asking for bundle packages — "sell 10× Signature
-- Mani & Pedi", where a Signature Mani & Pedi is a bundle in the
-- catalog (Signature Manicure + Signature Pedicure). Before this
-- migration package_items.service_id was NOT NULL; the only way to
-- express a bundle package was to add one row per underlying service,
-- which decoupled the sold quantity from the bundle definition and
-- broke the redeem flow when the owner clicked Apply on a bundle
-- appointment.
--
-- Model: package_items now carries EITHER service_id OR bundle_id —
-- never both, never neither. Enforced by a CHECK constraint. The
-- redemption RPC (redeem_package_session) is unchanged — it takes a
-- package_item_id and decrements sessions_used regardless of what the
-- item points at. The application layer picks the matching item when
-- deciding which one to apply to an appointment.
--
-- Safe on live data: every existing row has service_id set, so the
-- XOR constraint holds for all pre-migration rows unchanged.

ALTER TABLE package_items
  ALTER COLUMN service_id DROP NOT NULL;

ALTER TABLE package_items
  ADD COLUMN IF NOT EXISTS bundle_id uuid
    REFERENCES service_bundles(id) ON DELETE RESTRICT;

-- Exactly one of service_id / bundle_id must be set. Uses ::int
-- addition rather than XOR so the intent is obvious at a glance.
ALTER TABLE package_items
  DROP CONSTRAINT IF EXISTS package_items_target_check;
ALTER TABLE package_items
  ADD CONSTRAINT package_items_target_check
    CHECK (((service_id IS NOT NULL)::int + (bundle_id IS NOT NULL)::int) = 1);

-- Read paths look up items by bundle_id when matching an appointment
-- that was booked as a bundle. Same pattern as the service_id lookup
-- covered by idx_package_items_package via the join.
CREATE INDEX IF NOT EXISTS idx_package_items_bundle
  ON package_items(bundle_id) WHERE bundle_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
