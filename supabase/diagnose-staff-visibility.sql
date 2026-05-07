-- ============================================
-- DIAGNOSTIC: Why can't staff see appointments?
--
-- Compares each profile's salon_id against the owner's salon_id.
-- Anything other than "OK" indicates the cause of the visibility bug.
-- ============================================

with owner_salon as (
  select salon_id
  from profiles
  where role = 'owner'
  order by created_at
  limit 1
)
select
  p.full_name,
  p.role,
  p.salon_id,
  case
    when p.salon_id is null then 'BROKEN — no salon assignment'
    when p.salon_id = (select salon_id from owner_salon) then 'OK'
    else 'MISMATCH — different salon than the owner'
  end as status
from profiles p
order by p.role, p.created_at;

-- Also check the most recent appointments
select
  a.id,
  a.date,
  a.time,
  a.salon_id,
  case
    when a.salon_id = (select salon_id from profiles where role = 'owner' order by created_at limit 1) then 'OK'
    else 'MISMATCH'
  end as status
from appointments a
order by a.created_at desc
limit 5;
