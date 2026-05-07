-- ============================================
-- MIGRATION 023: sort_order on services + service_bundles
--
-- Lets owners drag-to-reorder catalog items. Categories already have
-- sort_order from migration 002. Bundles + services pick it up here.
--
-- Backfill assigns positions from the existing order (created_at desc,
-- which is what the UI shows today) so nothing visibly moves on load.
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

-- ---- services.sort_order ----
alter table services
  add column if not exists sort_order integer not null default 0;

-- Backfill: number rows within each salon by current display order so
-- post-migration the catalog reads identical to pre-migration. Using a
-- window function in an UPDATE...FROM:
update services s
   set sort_order = sub.rn
  from (
    select id, row_number() over (
      partition by salon_id
      order by created_at desc
    ) as rn
    from services
  ) sub
 where s.id = sub.id
   and s.sort_order = 0;

create index if not exists services_salon_sort_idx
  on services (salon_id, sort_order);


-- ---- service_bundles.sort_order ----
alter table service_bundles
  add column if not exists sort_order integer not null default 0;

update service_bundles b
   set sort_order = sub.rn
  from (
    select id, row_number() over (
      partition by salon_id
      order by created_at desc
    ) as rn
    from service_bundles
  ) sub
 where b.id = sub.id
   and b.sort_order = 0;

create index if not exists service_bundles_salon_sort_idx
  on service_bundles (salon_id, sort_order);

notify pgrst, 'reload schema';

commit;
