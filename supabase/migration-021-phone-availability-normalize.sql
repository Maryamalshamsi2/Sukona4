-- ============================================
-- MIGRATION 021: Normalize phone in check_signup_availability
--
-- Supabase auth stores phone numbers in `auth.users.phone` as digits-only
-- (it strips the leading `+` and any other non-digit characters before
-- inserting). Our RPC was comparing `phone = p_phone` with `p_phone`
-- still in `+971501234567` form, so duplicates were never detected at
-- the pre-check stage. The error then surfaced later from
-- `auth.admin.createUser` as the raw "Phone number already registered
-- by another user" message — confusing because the RPC said it was free.
--
-- Fix: strip non-digit characters from both sides before comparing.
-- Also normalize email comparisons by trimming whitespace.
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

create or replace function check_signup_availability(
  p_email text,
  p_phone text
)
returns table(email_taken boolean, phone_taken boolean)
language sql
stable
security definer
set search_path = public, auth
as $$
  with normalized as (
    select
      nullif(lower(trim(coalesce(p_email, ''))), '') as norm_email,
      nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') as norm_phone
  )
  select
    exists(
      select 1 from auth.users, normalized
      where normalized.norm_email is not null
        and lower(auth.users.email) = normalized.norm_email
    ) as email_taken,
    exists(
      select 1 from auth.users, normalized
      where normalized.norm_phone is not null
        and regexp_replace(coalesce(auth.users.phone, ''), '\D', '', 'g')
            = normalized.norm_phone
    ) as phone_taken;
$$;

revoke all on function check_signup_availability(text, text) from public;
grant execute on function check_signup_availability(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
