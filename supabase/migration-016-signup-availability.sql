-- ============================================
-- MIGRATION 016: check_signup_availability RPC
--
-- Lets the signup API surface "this email/phone is already in use"
-- BEFORE calling auth.admin.createUser — much friendlier than the raw
-- Supabase error.
--
-- The function reads from auth.users (which is in the `auth` schema and
-- not directly exposed to PostgREST). `security definer` lets it run with
-- elevated privileges; the function is locked down to SELECT-only and
-- only returns booleans, so no PII is leaked.
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
  select
    exists(
      select 1 from auth.users
      where p_email is not null
        and lower(email) = lower(p_email)
    ) as email_taken,
    exists(
      select 1 from auth.users
      where p_phone is not null
        and phone = p_phone
    ) as phone_taken;
$$;

-- Anonymous users need to call this before they have a session, so grant
-- to anon as well as authenticated. The function only returns booleans.
revoke all on function check_signup_availability(text, text) from public;
grant execute on function check_signup_availability(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
