-- ============================================
-- MIGRATION 004: Parallel/Sequential Services
-- Run this in Supabase SQL Editor
-- ============================================

-- Add is_parallel and sort_order to appointment_services
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'appointment_services' and column_name = 'is_parallel'
  ) then
    alter table appointment_services add column is_parallel boolean not null default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'appointment_services' and column_name = 'sort_order'
  ) then
    alter table appointment_services add column sort_order integer not null default 0;
  end if;
end $$;

-- Refresh schema cache
notify pgrst, 'reload schema';
