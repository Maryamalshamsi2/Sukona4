-- ============================================
-- MIGRATION 002: Categories + Team Groups
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. SERVICE CATEGORIES
-- ============================================

create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table service_categories enable row level security;

create policy "Authenticated users can view categories"
  on service_categories for select
  to authenticated
  using (true);

create policy "Owner/admin can manage categories"
  on service_categories for all
  to authenticated
  using (is_owner_or_admin());

-- Add category_id to services
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'services' and column_name = 'category_id'
  ) then
    alter table services add column category_id uuid references service_categories on delete set null;
  end if;
end $$;

-- ============================================
-- 2. TEAM GROUPS
-- ============================================

create table if not exists team_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table team_groups enable row level security;

create policy "Authenticated users can view groups"
  on team_groups for select
  to authenticated
  using (true);

create policy "Owner/admin can manage groups"
  on team_groups for all
  to authenticated
  using (is_owner_or_admin());

-- ============================================
-- 3. EXTEND PROFILES
-- ============================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'group_id'
  ) then
    alter table profiles add column group_id uuid references team_groups on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'salary'
  ) then
    alter table profiles add column salary numeric(10, 2) not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'job_title'
  ) then
    alter table profiles add column job_title text;
  end if;
end $$;

-- ============================================
-- 4. ADD receipt_url TO EXPENSES
-- ============================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'expenses' and column_name = 'receipt_url'
  ) then
    alter table expenses add column receipt_url text;
  end if;
end $$;

-- ============================================
-- 5. RELOAD SCHEMA CACHE
-- ============================================
-- This tells Supabase to refresh its schema cache
-- so new columns are immediately available via the API.

notify pgrst, 'reload schema';
