-- Migration 011: Staff work schedules and days off

-- Weekly recurring schedule: one row per staff per day of week
create table if not exists staff_schedules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  is_day_off boolean not null default false,
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  unique(profile_id, day_of_week)
);

alter table staff_schedules enable row level security;

create policy "Authenticated users can read staff_schedules"
  on staff_schedules for select to authenticated using (true);

create policy "Owner/admin can manage staff_schedules"
  on staff_schedules for all to authenticated using (is_owner_or_admin());

-- One-off days off (vacations, sick days, etc.)
create table if not exists staff_days_off (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique(profile_id, date)
);

alter table staff_days_off enable row level security;

create policy "Authenticated users can read staff_days_off"
  on staff_days_off for select to authenticated using (true);

create policy "Owner/admin can manage staff_days_off"
  on staff_days_off for all to authenticated using (is_owner_or_admin());
