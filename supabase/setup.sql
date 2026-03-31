-- ============================================
-- SUKONA DATABASE SETUP
-- Run this in Supabase SQL Editor:
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================

-- ============================================
-- 1. PROFILES (extends Supabase auth.users)
-- ============================================
-- Every user who signs up gets a profile with a role.
-- The "owner" is the person who created the business.
-- "admin" can manage everything. "staff" can view and update appointments.

create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null,
  role text not null default 'staff' check (role in ('owner', 'admin', 'staff')),
  phone text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile when a new user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    -- First user becomes owner, rest become staff
    case
      when (select count(*) from profiles) = 0 then 'owner'
      else 'staff'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- 2. CLIENTS
-- ============================================

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================
-- 3. SERVICES
-- ============================================

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10, 2) not null default 0,
  duration_minutes integer not null default 60,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================
-- 4. APPOINTMENTS
-- ============================================

create table appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients on delete cascade not null,
  service_id uuid references services on delete set null,
  date date not null,
  time time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'on_the_way', 'arrived', 'completed', 'paid', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================
-- 5. APPOINTMENT_STAFF (many-to-many)
-- ============================================
-- One appointment can have multiple staff assigned.
-- Any assigned staff can update the appointment.

create table appointment_staff (
  appointment_id uuid references appointments on delete cascade not null,
  staff_id uuid references profiles on delete cascade not null,
  primary key (appointment_id, staff_id)
);

-- ============================================
-- 6. PAYMENTS
-- ============================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments on delete cascade not null,
  amount numeric(10, 2) not null,
  method text not null check (method in ('cash', 'card')),
  created_at timestamptz not null default now()
);

-- ============================================
-- 7. EXPENSES
-- ============================================

create table expenses (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(10, 2) not null,
  category text not null default 'general',
  date date not null default current_date,
  created_at timestamptz not null default now()
);

-- ============================================
-- 8. INVENTORY
-- ============================================

create table inventory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity integer not null default 0,
  low_stock_threshold integer not null default 5,
  created_at timestamptz not null default now()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- RLS makes sure users can only access data if they're logged in.
-- All logged-in users can read everything (it's an internal system).
-- Only owner/admin can insert, update, delete most things.
-- Staff can update appointment status and payments (for their assigned appointments).

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table clients enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table appointment_staff enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table inventory enable row level security;

-- Helper: check if current user is owner or admin
create or replace function is_owner_or_admin()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('owner', 'admin')
  );
$$ language sql security definer;

-- Helper: check if current user is assigned to an appointment
create or replace function is_assigned_staff(apt_id uuid)
returns boolean as $$
  select exists (
    select 1 from appointment_staff
    where appointment_id = apt_id
    and staff_id = auth.uid()
  );
$$ language sql security definer;

-- ---- PROFILES ----
create policy "Users can view all profiles"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid());

create policy "Owner/admin can update any profile"
  on profiles for update
  to authenticated
  using (is_owner_or_admin());

-- ---- CLIENTS ----
create policy "Authenticated users can view clients"
  on clients for select
  to authenticated
  using (true);

create policy "Owner/admin can manage clients"
  on clients for all
  to authenticated
  using (is_owner_or_admin());

-- ---- SERVICES ----
create policy "Authenticated users can view services"
  on services for select
  to authenticated
  using (true);

create policy "Owner/admin can manage services"
  on services for all
  to authenticated
  using (is_owner_or_admin());

-- ---- APPOINTMENTS ----
create policy "Authenticated users can view appointments"
  on appointments for select
  to authenticated
  using (true);

create policy "Owner/admin can manage appointments"
  on appointments for all
  to authenticated
  using (is_owner_or_admin());

create policy "Assigned staff can update appointments"
  on appointments for update
  to authenticated
  using (is_assigned_staff(id));

-- ---- APPOINTMENT_STAFF ----
create policy "Authenticated users can view assignment"
  on appointment_staff for select
  to authenticated
  using (true);

create policy "Owner/admin can manage assignment"
  on appointment_staff for all
  to authenticated
  using (is_owner_or_admin());

-- ---- PAYMENTS ----
create policy "Authenticated users can view payments"
  on payments for select
  to authenticated
  using (true);

create policy "Owner/admin can manage payments"
  on payments for all
  to authenticated
  using (is_owner_or_admin());

create policy "Assigned staff can insert payments"
  on payments for insert
  to authenticated
  with check (is_assigned_staff(appointment_id));

-- ---- EXPENSES ----
create policy "Authenticated users can view expenses"
  on expenses for select
  to authenticated
  using (true);

create policy "Owner/admin can manage expenses"
  on expenses for all
  to authenticated
  using (is_owner_or_admin());

-- ---- INVENTORY ----
create policy "Authenticated users can view inventory"
  on inventory for select
  to authenticated
  using (true);

create policy "Owner/admin can manage inventory"
  on inventory for all
  to authenticated
  using (is_owner_or_admin());
