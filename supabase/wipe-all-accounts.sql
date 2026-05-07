-- ============================================
-- WIPE ALL ACCOUNTS — DESTRUCTIVE, IRREVERSIBLE
-- ============================================
--
-- Deletes every salon, every profile, every appointment, every payment,
-- every uploaded receipt URL reference, every review, every WhatsApp
-- log, and every auth.users row in this Supabase project.
--
-- WHAT IT DOES, IN ORDER:
--   1. delete from public.salons
--      → cascades through profiles.salon_id (CASCADE) — profiles gone
--      → cascades through every tenant table (clients, appointments,
--        appointment_services, appointment_staff, payments, expenses,
--        inventory, services, service_categories, service_bundles,
--        team_groups, calendar_blocks, petty_cash_log, activity_log,
--        staff_schedules, staff_days_off, reviews, whatsapp_send_log)
--   2. delete from auth.users
--      → no FK now blocks because all salons + profiles are gone
--
-- WHAT IT DOES NOT DO:
--   - Storage files (receipt images you uploaded). If you want those
--     gone too, go to Supabase → Storage and delete the bucket contents
--     manually. They're orphaned otherwise but harmless.
--   - Migrations / schema. Tables and policies stay; just the rows go.
--
-- HOW TO USE:
--   Run "STEP 1" first to see what's about to be deleted. Confirm the
--   numbers look right. Then run "STEP 2" to actually do it.
--
-- ============================================

-- ============ STEP 1 — COUNT (read-only, run first) ============
select 'auth.users' as table_name, count(*) as rows from auth.users
union all
select 'profiles', count(*) from public.profiles
union all
select 'salons', count(*) from public.salons
union all
select 'appointments', count(*) from public.appointments
union all
select 'clients', count(*) from public.clients
union all
select 'payments', count(*) from public.payments
union all
select 'expenses', count(*) from public.expenses
union all
select 'inventory', count(*) from public.inventory
union all
select 'reviews', count(*) from public.reviews
union all
select 'whatsapp_send_log', count(*) from public.whatsapp_send_log;


-- ============ STEP 2 — DELETE (run only after confirming the counts) ============
-- Wrapped in a transaction so you can ROLLBACK if anything looks wrong.
-- To execute, replace the line `rollback;` at the end with `commit;`.

begin;

  -- 1. Salons cascade to profiles + every tenant row.
  delete from public.salons;

  -- 2. Auth users (no FK blocks left).
  delete from auth.users;

  -- Sanity check — every count should now be 0.
  select 'auth.users' as table_name, count(*) as rows from auth.users
  union all
  select 'profiles', count(*) from public.profiles
  union all
  select 'salons', count(*) from public.salons
  union all
  select 'appointments', count(*) from public.appointments
  union all
  select 'clients', count(*) from public.clients
  union all
  select 'payments', count(*) from public.payments;

-- Replace `rollback;` with `commit;` to make the wipe permanent.
rollback;
