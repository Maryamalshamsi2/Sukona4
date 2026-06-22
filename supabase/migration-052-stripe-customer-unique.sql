-- Migration 052: UNIQUE on salons.stripe_customer_id
--
-- Pre-launch audit Blocker #4. The /api/stripe/checkout handler
-- check-then-creates the Stripe Customer:
--   1. SELECT salon.stripe_customer_id
--   2. If NULL → stripe.customers.create()
--   3. UPDATE salon.stripe_customer_id with the new id
--
-- Two concurrent checkouts (double-click, tab restore, retry) can
-- both see NULL at step 1, both reach step 2, and both create a
-- Stripe Customer. Step 3 then overwrites — the salon row points
-- at customer B, customer A is orphaned in Stripe (no salon row
-- references it). If subscriptions or invoices later attach to
-- A, the webhook can't find the salon and billing drifts forever.
--
-- This migration adds a partial unique index. The .update step is
-- now an atomic claim — second writer hits a conflict and the
-- handler can recover by re-fetching the row (the other request
-- won the race). Partial because NULL values must remain
-- duplicate-allowed (every salon starts there before its first
-- checkout).

create unique index if not exists salons_stripe_customer_id_unique
  on salons (stripe_customer_id)
  where stripe_customer_id is not null;

NOTIFY pgrst, 'reload schema';
