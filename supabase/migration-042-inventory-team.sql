-- migration-042-inventory-team.sql
--
-- Per-team inventory (Multi-Team v1.6).
--
-- Adds an optional `team_id` to inventory rows so a salon running
-- multiple regional teams (Multi-Team plan) can track stock
-- per-team. Nullable on purpose:
--
--   team_id IS NULL  → "salon-wide" item, visible from every team
--                       (think: reception supplies, business cards,
--                        software licenses — anything that isn't
--                        physically tied to one team's van/kit)
--   team_id IS SET   → item belongs to that team only; only members
--                       of that team see + edit its stock count
--
-- Backwards-compat: existing rows keep team_id = NULL by default, so
-- every salon's inventory continues to behave exactly as before
-- until the owner deliberately starts categorising items per team.
--
-- ON DELETE SET NULL — when a team_group is deleted, its items
-- "graduate" to salon-wide rather than disappearing with the team.
-- Matches the conservative-data-keeping pattern used for
-- staff_adjustments.created_by and activity_log.performed_by.

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES team_groups(id) ON DELETE SET NULL;

-- Hot read path: "items for THIS team (plus salon-wide shared items)."
CREATE INDEX IF NOT EXISTS idx_inventory_team_id
  ON inventory(team_id);

NOTIFY pgrst, 'reload schema';
