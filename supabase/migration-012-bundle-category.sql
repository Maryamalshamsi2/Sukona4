-- ============================================
-- MIGRATION 012: Add category to service_bundles
-- Bundles now belong to a category (like services),
-- so they can be listed inside the owning category's
-- tab rather than a separate "Bundles" section.
-- Run this in Supabase SQL Editor.
-- ============================================

alter table service_bundles
  add column if not exists category_id uuid
    references service_categories on delete set null;

create index if not exists service_bundles_category_id_idx
  on service_bundles (category_id);
