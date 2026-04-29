-- ============================================
-- MIGRATION 017: Track notification read state per user
--
-- Powers the in-app notification bell: unread count = number of
-- activity_log rows in the user's salon with created_at > this timestamp.
--
-- We use a single timestamp column rather than a per-row read table
-- because the bell only needs "anything new since last open?" — full
-- per-row read state would be over-engineered for v1.
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

alter table profiles
  add column if not exists notifications_last_read_at timestamptz;

-- Default existing users to "all notifications already read" so opening
-- the bell on day 1 doesn't show 6 months of historic activity as unread.
update profiles
   set notifications_last_read_at = now()
 where notifications_last_read_at is null;

notify pgrst, 'reload schema';

commit;
