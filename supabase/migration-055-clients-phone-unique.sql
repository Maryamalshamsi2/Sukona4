-- Migration 055: enforce phone uniqueness within a salon
--
-- Prevents the same client from being added twice with the same
-- phone number. UI catches this at add-time with a friendly toast
-- ("That phone number is already used by another client"); this
-- constraint is the DB-level safety net so a bypassed UI, direct
-- SQL, or the (future) historical-data import can't sneak
-- duplicates in either.
--
-- Partial index: only enforces when phone IS NOT NULL. Rare
-- anonymous / walk-in clients with no phone on file aren't
-- deduped against each other.
--
-- IMPORTANT — this migration will FAIL if any salon currently has
-- (salon_id, phone) duplicates. If that happens, list them first:
--
--   select salon_id, phone, count(*)
--   from clients
--   where phone is not null
--   group by salon_id, phone
--   having count(*) > 1;
--
-- Merge those duplicates (via /clients → Review duplicates once
-- that UI ships, or by hand in the Table Editor: pick a primary,
-- reassign the secondary's appointments/gift_cards/packages to
-- the primary, delete the secondary), then re-apply this migration.

create unique index if not exists clients_salon_phone_unique
  on clients (salon_id, phone)
  where phone is not null;

NOTIFY pgrst, 'reload schema';
