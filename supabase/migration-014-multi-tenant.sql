-- ============================================
-- MIGRATION 014: Multi-tenant (salons)
-- Run this in Supabase SQL Editor.
--
-- Adds a `salons` table and a `salon_id` column on every tenant-scoped
-- table. RLS is rewritten so users only ever see rows that belong to
-- their own salon.
--
-- Existing data is backfilled into a single salon called "Ateeq Spa"
-- so the current production user (and Richie) keep working unchanged.
--
-- Idempotent: safe to re-run. Each step checks for existence first.
-- ============================================

begin;

-- ============================================
-- 1. SALONS TABLE
-- ============================================
create table if not exists salons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  brand_color text default '#0A0A0A',
  contact_phone text,
  public_review_url text,
  signoff text,
  default_language text not null default 'en',
  -- WhatsApp Cloud API config (filled in Phase 4)
  whatsapp_phone_number_id text,
  whatsapp_business_account_id text,
  whatsapp_access_token text, -- encrypted at rest in Supabase Vault later
  -- onboarding state
  is_onboarded boolean not null default false,
  -- the auth user who created this salon
  owner_id uuid references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table salons enable row level security;

-- ============================================
-- 2. BACKFILL: create default salon for existing data
-- ============================================
do $$
declare
  default_salon_id uuid;
  current_owner uuid;
begin
  select id into default_salon_id from salons limit 1;

  if default_salon_id is null then
    select id into current_owner from profiles
      where role = 'owner' order by created_at limit 1;

    insert into salons (name, slug, owner_id, is_onboarded)
    values ('Ateeq Spa', 'ateeq-spa', current_owner, true)
    returning id into default_salon_id;
  end if;
end $$;

-- ============================================
-- 3a. ADD salon_id TO profiles FIRST
-- The helper function below references profiles.salon_id, and SQL
-- functions are validated at create time — so the column has to
-- exist before we define the helper. The loop in step 5 will skip
-- profiles because the column will already be there.
-- ============================================
do $$
declare
  default_salon_id uuid := (select id from salons order by created_at limit 1);
begin
  if default_salon_id is null then
    raise exception 'No default salon found — backfill step must run first';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'salon_id'
  ) then
    alter table profiles add column salon_id uuid references salons on delete cascade;
  end if;

  update profiles set salon_id = default_salon_id where salon_id is null;
  alter table profiles alter column salon_id set not null;
  create index if not exists profiles_salon_id_idx on profiles (salon_id);
end $$;

-- ============================================
-- 3b. HELPER: current_user_salon_id()
-- Used in DEFAULT clauses and RLS policies.
-- ============================================
create or replace function current_user_salon_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select salon_id from profiles where id = auth.uid();
$$;

-- ============================================
-- 4. HELPER: is_owner_or_admin() — re-create to be salon-scoped
-- (already user-scoped through profiles, this just makes intent explicit)
-- ============================================
create or replace function is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- ============================================
-- 5. ADD salon_id TO EVERY TENANT TABLE + BACKFILL
-- ============================================
do $$
declare
  default_salon_id uuid := (select id from salons order by created_at limit 1);
  tbl text;
  tenant_tables text[] := array[
    'profiles',
    'clients',
    'services',
    'service_categories',
    'service_bundles',
    'service_bundle_items',
    'appointments',
    'appointment_staff',
    'appointment_services',
    'payments',
    'expenses',
    'inventory',
    'team_groups',
    'calendar_blocks',
    'petty_cash_log',
    'activity_log',
    'staff_schedules',
    'staff_days_off'
  ];
begin
  if default_salon_id is null then
    raise exception 'No default salon found — backfill step must run first';
  end if;

  foreach tbl in array tenant_tables loop
    -- Skip tables that don't exist (defensive — in case a migration was skipped)
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = tbl
    ) then
      raise notice 'Skipping % (table not found)', tbl;
      continue;
    end if;

    -- Add column if missing
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = tbl
         and column_name = 'salon_id'
    ) then
      execute format('alter table %I add column salon_id uuid references salons on delete cascade', tbl);
    end if;

    -- Backfill any nulls with the default salon
    execute format('update %I set salon_id = %L where salon_id is null', tbl, default_salon_id);

    -- Set NOT NULL (only if it isn't already)
    execute format('alter table %I alter column salon_id set not null', tbl);

    -- Default new rows to the calling user's salon (so server actions don't
    -- have to set salon_id manually).
    execute format('alter table %I alter column salon_id set default current_user_salon_id()', tbl);

    -- Index on salon_id for fast filtering
    execute format('create index if not exists %I on %I (salon_id)',
      tbl || '_salon_id_idx', tbl);
  end loop;
end $$;

-- ============================================
-- 6. profiles.email — make nullable (phone-only signups need this)
-- ============================================
alter table profiles alter column email drop not null;

-- ============================================
-- 7. DROP ALL EXISTING POLICIES ON TENANT TABLES
-- We rewrite them all below with salon-scoped checks.
-- ============================================
do $$
declare
  pol record;
  tenant_tables text[] := array[
    'salons',
    'profiles',
    'clients',
    'services',
    'service_categories',
    'service_bundles',
    'service_bundle_items',
    'appointments',
    'appointment_staff',
    'appointment_services',
    'payments',
    'expenses',
    'inventory',
    'team_groups',
    'calendar_blocks',
    'petty_cash_log',
    'activity_log',
    'staff_schedules',
    'staff_days_off'
  ];
  tbl text;
begin
  foreach tbl in array tenant_tables loop
    if not exists (
      select 1 from information_schema.tables
       where table_schema = 'public' and table_name = tbl
    ) then
      continue;
    end if;
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
    end loop;
  end loop;
end $$;

-- ============================================
-- 8. RECREATE POLICIES — salon-scoped
-- ============================================

-- ---- SALONS ----
-- Members read their own salon. Owners update it.
create policy "Members can read own salon"
  on salons for select
  to authenticated
  using (id = current_user_salon_id());

create policy "Owners can update own salon"
  on salons for update
  to authenticated
  using (id = current_user_salon_id() and is_owner_or_admin());

-- Insert/delete handled by signup trigger / admin only — no public policy.

-- ---- PROFILES ----
-- Self-read FIRST (avoids RLS recursion in current_user_salon_id())
create policy "Users can read own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Salon members can read profiles in salon"
  on profiles for select
  to authenticated
  using (salon_id = current_user_salon_id());

create policy "Users can update own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid());

create policy "Owner/admin can update profiles in salon"
  on profiles for update
  to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin());

create policy "Owner/admin can insert profiles in salon"
  on profiles for insert
  to authenticated
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- CLIENTS ----
create policy "Salon members can view clients"
  on clients for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage clients"
  on clients for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- SERVICES ----
create policy "Salon members can view services"
  on services for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage services"
  on services for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- SERVICE_CATEGORIES ----
create policy "Salon members can view categories"
  on service_categories for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage categories"
  on service_categories for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- SERVICE_BUNDLES ----
create policy "Salon members can view bundles"
  on service_bundles for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage bundles"
  on service_bundles for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- SERVICE_BUNDLE_ITEMS ----
create policy "Salon members can view bundle items"
  on service_bundle_items for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage bundle items"
  on service_bundle_items for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- APPOINTMENTS ----
create policy "Salon members can view appointments"
  on appointments for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage appointments"
  on appointments for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

create policy "Assigned staff can update appointments in salon"
  on appointments for update to authenticated
  using (salon_id = current_user_salon_id() and is_assigned_staff(id));

-- ---- APPOINTMENT_STAFF ----
create policy "Salon members can view appointment_staff"
  on appointment_staff for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage appointment_staff"
  on appointment_staff for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- APPOINTMENT_SERVICES ----
create policy "Salon members can view appointment_services"
  on appointment_services for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage appointment_services"
  on appointment_services for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

create policy "Assigned staff can manage own appointment_services"
  on appointment_services for all to authenticated
  using (salon_id = current_user_salon_id() and staff_id = auth.uid())
  with check (salon_id = current_user_salon_id() and staff_id = auth.uid());

-- ---- PAYMENTS ----
create policy "Salon members can view payments"
  on payments for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage payments"
  on payments for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

create policy "Salon members can record payments"
  on payments for insert to authenticated
  with check (salon_id = current_user_salon_id());

-- ---- EXPENSES ----
create policy "Salon members can view expenses"
  on expenses for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage expenses"
  on expenses for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- INVENTORY ----
create policy "Salon members can view inventory"
  on inventory for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage inventory"
  on inventory for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- TEAM_GROUPS ----
create policy "Salon members can view groups"
  on team_groups for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage groups"
  on team_groups for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- CALENDAR_BLOCKS ----
create policy "Salon members can view calendar_blocks"
  on calendar_blocks for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage calendar_blocks"
  on calendar_blocks for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

create policy "Staff can manage own calendar_blocks"
  on calendar_blocks for all to authenticated
  using (salon_id = current_user_salon_id() and staff_id = auth.uid())
  with check (salon_id = current_user_salon_id() and staff_id = auth.uid());

-- ---- PETTY_CASH_LOG ----
create policy "Salon members can view petty_cash_log"
  on petty_cash_log for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Salon members can manage petty_cash_log"
  on petty_cash_log for all to authenticated
  using (salon_id = current_user_salon_id())
  with check (salon_id = current_user_salon_id());

-- ---- ACTIVITY_LOG ----
create policy "Salon members can view activity_log"
  on activity_log for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Salon members can insert activity_log"
  on activity_log for insert to authenticated
  with check (salon_id = current_user_salon_id());

-- ---- STAFF_SCHEDULES ----
create policy "Salon members can read staff_schedules"
  on staff_schedules for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage staff_schedules"
  on staff_schedules for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ---- STAFF_DAYS_OFF ----
create policy "Salon members can read staff_days_off"
  on staff_days_off for select to authenticated
  using (salon_id = current_user_salon_id());

create policy "Owner/admin can manage staff_days_off"
  on staff_days_off for all to authenticated
  using (salon_id = current_user_salon_id() and is_owner_or_admin())
  with check (salon_id = current_user_salon_id() and is_owner_or_admin());

-- ============================================
-- 9. UPDATE handle_new_user TRIGGER
-- New direct signup → create new salon, user becomes owner.
-- New invited member → metadata.salon_id is set by admin createUser, profile attaches to that salon.
-- ============================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_salon uuid;
  new_salon_id  uuid;
  invited_role  text;
  display_name  text;
begin
  invited_salon := nullif(new.raw_user_meta_data->>'salon_id', '')::uuid;
  invited_role  := coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'staff');
  display_name  := coalesce(new.raw_user_meta_data->>'full_name', '');

  if invited_salon is not null then
    -- Invited team member: attach to existing salon
    insert into profiles (id, email, full_name, role, salon_id)
    values (
      new.id,
      new.email,
      display_name,
      invited_role,
      invited_salon
    );
  else
    -- Direct signup: create their own salon, mark them as owner
    insert into salons (name, owner_id, is_onboarded)
    values (
      coalesce(nullif(display_name, ''), 'My Salon') || '''s Salon',
      new.id,
      false
    )
    returning id into new_salon_id;

    insert into profiles (id, email, full_name, role, salon_id)
    values (
      new.id,
      new.email,
      display_name,
      'owner',
      new_salon_id
    );
  end if;

  return new;
end;
$$;

-- Trigger already exists from setup.sql, but recreate to be safe
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- 10. RELOAD SCHEMA CACHE
-- ============================================
notify pgrst, 'reload schema';

commit;
