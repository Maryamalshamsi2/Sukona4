-- ============================================
-- MIGRATION 015: Carry phone through to profiles on signup
--
-- The previous handle_new_user trigger only copied `email` from auth.users
-- to profiles. When an owner signs up with a phone number (no email),
-- profiles.email and profiles.phone both end up null, which means the team
-- page doesn't know how to contact them.
--
-- This migration recreates handle_new_user to also copy `phone`.
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

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
    insert into profiles (id, email, phone, full_name, role, salon_id)
    values (
      new.id,
      new.email,
      new.phone,
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

    insert into profiles (id, email, phone, full_name, role, salon_id)
    values (
      new.id,
      new.email,
      new.phone,
      display_name,
      'owner',
      new_salon_id
    );
  end if;

  return new;
end;
$$;

-- Trigger already exists from migration 014, but recreate to be safe
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

notify pgrst, 'reload schema';

commit;
