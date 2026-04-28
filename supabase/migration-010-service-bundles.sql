-- ============================================
-- MIGRATION 010: Service Bundles
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. SERVICE BUNDLES
-- ============================================

create table if not exists service_bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_type text not null default 'fixed' check (discount_type in ('percentage', 'fixed')),
  discount_percentage numeric(5, 2),
  fixed_price numeric(10, 2),
  duration_override integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table service_bundles enable row level security;

create policy "Authenticated users can view bundles"
  on service_bundles for select
  to authenticated
  using (true);

create policy "Owner/admin can manage bundles"
  on service_bundles for all
  to authenticated
  using (is_owner_or_admin());

-- ============================================
-- 2. SERVICE BUNDLE ITEMS (junction table)
-- ============================================

create table if not exists service_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references service_bundles on delete cascade,
  service_id uuid not null references services on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table service_bundle_items enable row level security;

create policy "Authenticated users can view bundle items"
  on service_bundle_items for select
  to authenticated
  using (true);

create policy "Owner/admin can manage bundle items"
  on service_bundle_items for all
  to authenticated
  using (is_owner_or_admin());
