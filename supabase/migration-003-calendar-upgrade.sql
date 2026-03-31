-- ============================================
-- MIGRATION 003: Calendar Upgrade
-- Multi-service appointments + calendar blocks
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. APPOINTMENT SERVICES (replaces single service_id)
-- ============================================
-- Each appointment can have multiple services.
-- Each service is assigned to a specific staff member.

create table if not exists appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments on delete cascade not null,
  service_id uuid references services on delete cascade not null,
  staff_id uuid references profiles on delete set null,
  created_at timestamptz not null default now()
);

alter table appointment_services enable row level security;

create policy "Authenticated users can view appointment_services"
  on appointment_services for select
  to authenticated
  using (true);

create policy "Owner/admin can manage appointment_services"
  on appointment_services for all
  to authenticated
  using (is_owner_or_admin());

create policy "Assigned staff can manage their appointment_services"
  on appointment_services for all
  to authenticated
  using (staff_id = auth.uid());

-- ============================================
-- 2. CALENDAR BLOCKS (buffer/blocked time)
-- ============================================
-- For lunch breaks, travel time, etc.

create table if not exists calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles on delete cascade not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  title text not null default 'Blocked',
  block_type text not null default 'break'
    check (block_type in ('break', 'travel', 'personal', 'other')),
  created_at timestamptz not null default now()
);

alter table calendar_blocks enable row level security;

create policy "Authenticated users can view calendar_blocks"
  on calendar_blocks for select
  to authenticated
  using (true);

create policy "Owner/admin can manage calendar_blocks"
  on calendar_blocks for all
  to authenticated
  using (is_owner_or_admin());

create policy "Staff can manage own blocks"
  on calendar_blocks for all
  to authenticated
  using (staff_id = auth.uid());

-- ============================================
-- 3. ADD duration_override TO APPOINTMENTS
-- ============================================
-- Allows manual override of auto-calculated duration
-- (e.g. when user resizes the block on calendar)

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'appointments' and column_name = 'duration_override'
  ) then
    alter table appointments add column duration_override integer;
  end if;
end $$;

-- Refresh schema cache
notify pgrst, 'reload schema';
