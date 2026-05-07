-- ============================================
-- FIX: Realign all staff/admin profiles to the owner's salon.
--
-- Run this ONLY if the diagnostic showed BROKEN/MISMATCH rows for staff.
-- Idempotent — safe to run multiple times.
-- ============================================

with owner_salon as (
  select salon_id
  from profiles
  where role = 'owner'
  order by created_at
  limit 1
)
update profiles
set salon_id = (select salon_id from owner_salon)
where role in ('staff', 'admin')
  and salon_id is distinct from (select salon_id from owner_salon);

-- Confirm — should now all show OK
with owner_salon as (
  select salon_id from profiles where role = 'owner' order by created_at limit 1
)
select full_name, role,
  case
    when salon_id = (select salon_id from owner_salon) then 'OK'
    else 'STILL BROKEN'
  end as status
from profiles
order by role, created_at;
