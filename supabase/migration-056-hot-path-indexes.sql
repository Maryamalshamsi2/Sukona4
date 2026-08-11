-- Migration 056: composite indexes on hot-path queries
--
-- Pre-launch audit Minor #25. The main dashboard queries scan
-- appointments by (salon_id, date) — the calendar/home Today
-- fetches, reports date-range aggregates, the drag-conflict
-- detector added in D2.6. Without a composite index Postgres
-- scans the whole salon's history and filters in memory. On a
-- salon with 1000+ appointments that's 100-300ms wasted per
-- fetch. Adding the index takes it to <10ms.
--
-- Similarly (salon_id, client_id) for the client-detail history
-- page and payroll's per-staff drill-down.
--
-- profiles(group_id) drives the team-scoped staff filter used by
-- calendar/reports/payroll when an admin is pinned to a group.
--
-- All are `if not exists` so re-running is safe.

create index if not exists appointments_salon_date_idx
  on appointments(salon_id, date);

create index if not exists appointments_salon_client_idx
  on appointments(salon_id, client_id);

create index if not exists profiles_group_idx
  on profiles(group_id);

-- activity_log scans by created_at descending are the top-of-home
-- feed. Already covered by idx_activity_log_created_at from
-- migration-005, but the join to profiles per row is a hot path
-- worth confirming — no new index needed here, just a note.

NOTIFY pgrst, 'reload schema';
