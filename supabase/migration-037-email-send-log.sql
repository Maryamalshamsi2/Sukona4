-- migration-037-email-send-log.sql
--
-- Audit log + idempotency table for transactional emails (Resend).
--
-- One row per send attempt — success or failure. The unique
-- constraint on (salon_id, email_type) is what makes the cron
-- job safe to re-run: if the welcome / trial-3d / trial-1d /
-- trial-ended row already exists for a salon, the insert fails
-- and the cron skips it. We don't ever want to spam a salon
-- with the same reminder twice.
--
-- Types intentionally enumerated rather than left free-form so a
-- typo in dispatch code can't silently create a new "kind" of
-- log row that the cron's "already sent?" check would miss.

CREATE TABLE IF NOT EXISTS email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  email_type text NOT NULL CHECK (
    email_type IN ('welcome', 'trial_3d', 'trial_1d', 'trial_ended')
  ),
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  resend_message_id text,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- One successful row per (salon, type). We allow multiple FAILED
-- rows so the cron can retry on the next tick without conflict,
-- but a 'sent' row blocks any future attempt. The partial unique
-- index gives us exactly that.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_send_log_sent
  ON email_send_log (salon_id, email_type)
  WHERE status = 'sent';

-- Hot read path: "has this salon been sent this email type?"
CREATE INDEX IF NOT EXISTS idx_email_send_log_lookup
  ON email_send_log (salon_id, email_type, status);

-- RLS — owners/admins can view their own salon's email history
-- (debug / support). Inserts come only from the service role
-- (cron + onboarding action via adminClient), so no INSERT policy
-- is exposed to authenticated users.
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner/admin can view own salon's email log"
  ON email_send_log FOR SELECT TO authenticated
  USING (salon_id = current_user_salon_id() AND is_owner_or_admin());

NOTIFY pgrst, 'reload schema';
