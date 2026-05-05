-- ============================================
-- MIGRATION 020: WhatsApp Cloud API send log
--
-- Every outbound WhatsApp send (success OR failure) writes one row here.
-- Powers:
--   - Settings → WhatsApp → "Recent sends" audit view
--   - The retry button on failed rows
--   - Debugging when customers say "I didn't get the message"
--
-- Per-salon credentials live on `salons.whatsapp_*` (already added in
-- earlier migrations). When those are null, the app falls back to wa.me
-- deep links and skips this table.
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

create table if not exists whatsapp_send_log (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references salons on delete cascade,
  -- Soft-link: keep the row even if the appointment is hard-deleted later
  -- so the audit log doesn't lose history.
  appointment_id uuid references appointments on delete set null,
  -- The Meta template name (e.g. "appointment_confirmation"). Free-text
  -- so we don't need a migration when adding a template.
  template_name text not null,
  -- E.164 destination ("+971...") — never store with name/PII.
  recipient_phone text not null,
  -- The {{1}}, {{2}}, ... values we substituted. Stored as a JSON array of
  -- strings to keep ordering. Useful for "show me what we actually sent".
  variables jsonb not null default '[]'::jsonb,
  -- Lifecycle: 'pending' (we haven't called the API yet — rare, only used
  -- if we ever queue), 'sent' (Meta accepted), 'failed' (Meta or network
  -- rejected). Read receipts via webhook are deferred to v2.
  status text not null check (status in ('pending', 'sent', 'failed')),
  -- Meta's wamid for the sent message. Null on failure.
  meta_message_id text,
  -- Trimmed error string when status='failed'. Plain text — full payload
  -- isn't worth the bytes.
  error_message text,
  -- When this row was a retry of an earlier failed send, points back at
  -- the original. Lets the UI render a chain ("retried from #abc").
  retried_from uuid references whatsapp_send_log on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_send_log_salon_id_idx
  on whatsapp_send_log (salon_id);
create index if not exists whatsapp_send_log_created_at_idx
  on whatsapp_send_log (created_at desc);
create index if not exists whatsapp_send_log_appointment_id_idx
  on whatsapp_send_log (appointment_id);

alter table whatsapp_send_log enable row level security;

-- Owner + admin can read their salon's send log.
drop policy if exists "Owner/admin can read whatsapp_send_log" on whatsapp_send_log;
create policy "Owner/admin can read whatsapp_send_log"
  on whatsapp_send_log for select to authenticated
  using (
    salon_id = current_user_salon_id()
    and is_owner_or_admin()
  );

-- Owner + admin can insert their salon's send log rows. The actual sender
-- runs server-side via service_role, but having this policy lets owner-side
-- UI flows (e.g. "test send") write directly when needed.
drop policy if exists "Owner/admin can insert whatsapp_send_log" on whatsapp_send_log;
create policy "Owner/admin can insert whatsapp_send_log"
  on whatsapp_send_log for insert to authenticated
  with check (
    salon_id = current_user_salon_id()
    and is_owner_or_admin()
  );

notify pgrst, 'reload schema';

commit;
