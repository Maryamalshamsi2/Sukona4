-- ============================================
-- MIGRATION 013: Payment method + receipt
-- - Widen payments.method to include 'other'
-- - Add receipt_url (optional image stored in `receipts` bucket)
-- - Add note (optional free text, used when method='other')
-- - Broaden insert RLS so any staff / owner / admin can record a payment
-- Run this in Supabase SQL Editor.
-- ============================================

-- Widen the method check constraint to include 'other'.
alter table payments drop constraint if exists payments_method_check;
alter table payments
  add constraint payments_method_check
  check (method in ('cash', 'card', 'other'));

-- Optional receipt image URL (publicly readable via `receipts` bucket)
alter table payments add column if not exists receipt_url text;

-- Optional free-text note (used when method = 'other', e.g. "Bank transfer")
alter table payments add column if not exists note text;

-- Any authenticated user (staff, owner, admin) can record a payment.
drop policy if exists "Assigned staff can insert payments" on payments;
drop policy if exists "Authenticated can insert payments" on payments;
create policy "Authenticated can insert payments"
  on payments for insert
  to authenticated
  with check (true);
