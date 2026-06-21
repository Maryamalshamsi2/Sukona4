-- Migration 049: stripe_events idempotency table
--
-- Stripe retries webhook deliveries aggressively — every timeout, 5xx,
-- or network blip can re-fire the same event id. Without dedup the
-- same `customer.subscription.deleted` (or any other event) can
-- mutate salon state twice in quick succession.
--
-- Worst observed shape: a recovered `invoice.payment_failed` event
-- arrives after the salon has already re-paid. Without dedup the
-- handler re-flips the salon to past_due even though Stripe's current
-- truth is "active" — and the next subscription.updated may or may
-- not fix it depending on event ordering.
--
-- This table is the dedup ledger. The webhook handler inserts the
-- event id with ON CONFLICT DO NOTHING; if the insert affected 0 rows,
-- the event is a duplicate and we return 200 immediately without
-- re-processing.
--
-- Service-role only — webhook uses the admin client. RLS would
-- otherwise force us to grant authenticated select/insert and that
-- would leak which events have hit our system.

CREATE TABLE IF NOT EXISTS stripe_events (
  -- The Stripe event id (evt_...) is globally unique across the
  -- entire Stripe account. UNIQUE here is the whole point of the
  -- table — INSERT ... ON CONFLICT DO NOTHING vs this column is
  -- the idempotency primitive.
  event_id      text PRIMARY KEY,
  event_type    text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now()
);

-- Index on event_type makes it easy to ad-hoc audit "how many of X
-- have we processed in the last hour" when debugging Stripe weirdness.
CREATE INDEX IF NOT EXISTS stripe_events_type_idx
  ON stripe_events (event_type, received_at DESC);

-- Lock the table down. RLS is enabled but no policies are defined —
-- only the service-role client (admin) can read/write, which is
-- what the webhook handler uses. authenticated/anon get nothing.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON stripe_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON stripe_events TO service_role;

NOTIFY pgrst, 'reload schema';
