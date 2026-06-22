-- Migration 051: atomic redemption + payment_row insertion
--
-- Pre-launch audit Blocker #6. Previously the MarkPaidModal called
-- `redeem_package_session` / `redeem_gift_card` FIRST, then made a
-- separate `recordPayment` call. If the second call failed (network
-- blip, validation, RLS), the redemption had ALREADY happened — the
-- session was consumed or the card balance decremented — but no
-- payment row was ever written. The appointment showed unpaid; the
-- customer's package/card was one session/AED short; reconciling
-- this required manual SQL.
--
-- Both new RPCs run the redemption AND the payment INSERT inside a
-- single PL/pgSQL function body, so the whole pair is one
-- transaction. Either both succeed or both roll back.
--
-- These RPCs DO NOT flip the appointment status, mint receipt
-- tokens, log activity, or dispatch WhatsApp — those side effects
-- happen in the server action AFTER the atomic call returns. They
-- are all idempotent (mint_receipt_for_appointment is, the status
-- update is a write-once flip, the activity log is best-effort),
-- so post-payment side effects falling out of sync just means the
-- next page render re-derives correct state. The dangerous race
-- was specifically "redeemed but unpaid" — that's now impossible.

-- ============================================================
-- redeem_package_session_with_payment
-- ============================================================

CREATE OR REPLACE FUNCTION redeem_package_session_with_payment(
  p_package_item_id   uuid,
  p_appointment_id    uuid,
  p_amount            numeric,
  p_note              text,
  p_tip_amount        numeric DEFAULT 0,
  p_tip_to_staff_id   uuid DEFAULT NULL,
  p_receipt_urls      text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
  out_payment_id          uuid,
  out_redemption_id       uuid,
  out_sessions_used       integer,
  out_sessions_remaining  integer,
  out_package_completed   boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item            record;
  v_pkg             record;
  v_user_salon      uuid;
  v_redemption_id   uuid;
  v_payment_id      uuid;
  v_total_remaining integer;
  v_completed       boolean := false;
BEGIN
  v_user_salon := current_user_salon_id();
  IF v_user_salon IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ---- Lock + validate the package_item (same shape as
  --      redeem_package_session post migration-048: every internal
  --      column reference is fully qualified to avoid colliding
  --      with the RETURNS TABLE output columns).
  SELECT package_items.id,
         package_items.package_id,
         package_items.sessions_total,
         package_items.sessions_used
    INTO v_item
    FROM package_items
    WHERE package_items.id = p_package_item_id
    FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Package item not found';
  END IF;

  -- Parent package — tenancy, status, expiry.
  SELECT packages.id, packages.salon_id, packages.status, packages.expires_at
    INTO v_pkg
    FROM packages
    WHERE packages.id = v_item.package_id;

  IF v_pkg.salon_id <> v_user_salon THEN
    RAISE EXCEPTION 'Package not found';
  END IF;
  IF v_pkg.status <> 'active' THEN
    RAISE EXCEPTION 'Package is %', v_pkg.status;
  END IF;
  IF v_pkg.expires_at IS NOT NULL AND v_pkg.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Package expired on %', v_pkg.expires_at;
  END IF;
  IF v_item.sessions_used >= v_item.sessions_total THEN
    RAISE EXCEPTION 'No sessions remaining for this item';
  END IF;

  -- Validate the appointment belongs to the same salon — defense in
  -- depth. RLS on appointments would catch a foreign reference but
  -- here we have the salon_id from the package's tenancy check
  -- already, so cheap to verify.
  IF NOT EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = p_appointment_id
      AND appointments.salon_id = v_user_salon
  ) THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  -- ---- Side effects: decrement, insert redemption, insert payment.

  UPDATE package_items
    SET sessions_used = v_item.sessions_used + 1
    WHERE package_items.id = v_item.id;

  INSERT INTO package_redemptions (
    salon_id, package_id, package_item_id,
    appointment_id, notes, created_by
  )
  VALUES (
    v_pkg.salon_id, v_pkg.id, v_item.id,
    p_appointment_id, p_note, auth.uid()
  )
  RETURNING id INTO v_redemption_id;

  INSERT INTO payments (
    appointment_id, amount, method, note,
    receipt_urls, receipt_url, tip_amount, tip_to_staff_id
  )
  VALUES (
    p_appointment_id,
    p_amount,
    'package',
    p_note,
    p_receipt_urls,
    (CASE WHEN array_length(p_receipt_urls, 1) > 0 THEN p_receipt_urls[1] ELSE NULL END),
    COALESCE(p_tip_amount, 0),
    p_tip_to_staff_id
  )
  RETURNING id INTO v_payment_id;

  -- Completed flag: did this redemption drain the last session on the package?
  SELECT SUM(package_items.sessions_total - package_items.sessions_used)
    INTO v_total_remaining
    FROM package_items
    WHERE package_items.package_id = v_pkg.id;
  IF v_total_remaining = 0 THEN
    UPDATE packages SET status = 'completed' WHERE packages.id = v_pkg.id;
    v_completed := true;
  END IF;

  RETURN QUERY
    SELECT
      v_payment_id,
      v_redemption_id,
      v_item.sessions_used + 1,
      v_item.sessions_total - (v_item.sessions_used + 1),
      v_completed;
END;
$$;

REVOKE ALL ON FUNCTION redeem_package_session_with_payment(uuid, uuid, numeric, text, numeric, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_package_session_with_payment(uuid, uuid, numeric, text, numeric, uuid, text[]) TO authenticated;

-- ============================================================
-- redeem_gift_card_with_payment
-- ============================================================

-- The legacy `redeem_gift_card` lives in migration-044; we re-create
-- the validation logic here and bundle the payment-row insertion in
-- the same transaction.

CREATE OR REPLACE FUNCTION redeem_gift_card_with_payment(
  p_code              text,
  p_amount            numeric,
  p_appointment_id    uuid,
  p_note              text,
  p_tip_amount        numeric DEFAULT 0,
  p_tip_to_staff_id   uuid DEFAULT NULL,
  p_receipt_urls      text[] DEFAULT ARRAY[]::text[]
)
RETURNS TABLE (
  out_payment_id     uuid,
  out_transaction_id uuid,
  out_new_balance    numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card        record;
  v_user_salon  uuid;
  v_new_balance numeric;
  v_tx_id       uuid;
  v_payment_id  uuid;
BEGIN
  v_user_salon := current_user_salon_id();
  IF v_user_salon IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Redemption amount must be positive';
  END IF;

  SELECT gift_cards.id, gift_cards.salon_id, gift_cards.status,
         gift_cards.balance, gift_cards.expires_at
    INTO v_card
    FROM gift_cards
    WHERE gift_cards.code = p_code
    FOR UPDATE;

  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;
  IF v_card.salon_id <> v_user_salon THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;
  IF v_card.status <> 'active' THEN
    RAISE EXCEPTION 'Gift card is %', v_card.status;
  END IF;
  IF v_card.expires_at IS NOT NULL AND v_card.expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Gift card expired on %', v_card.expires_at;
  END IF;
  IF p_amount > v_card.balance THEN
    RAISE EXCEPTION 'Amount exceeds card balance';
  END IF;

  -- Appointment tenancy fence.
  IF NOT EXISTS (
    SELECT 1 FROM appointments
    WHERE appointments.id = p_appointment_id
      AND appointments.salon_id = v_user_salon
  ) THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  v_new_balance := v_card.balance - p_amount;

  UPDATE gift_cards
    SET balance = v_new_balance,
        -- Flip to 'redeemed' when this redemption drains the card to 0.
        status = CASE WHEN v_new_balance = 0 THEN 'redeemed' ELSE 'active' END
    WHERE gift_cards.id = v_card.id;

  -- Audit log row in gift_card_transactions ("redemption" type).
  INSERT INTO gift_card_transactions (
    salon_id, gift_card_id, type, amount, appointment_id, notes, created_by
  )
  VALUES (
    v_user_salon, v_card.id, 'redemption', p_amount,
    p_appointment_id, p_note, auth.uid()
  )
  RETURNING id INTO v_tx_id;

  -- The matching payments row — same transaction, so the card
  -- balance and the payment row stay in lock-step forever.
  INSERT INTO payments (
    appointment_id, amount, method, note,
    receipt_urls, receipt_url, tip_amount, tip_to_staff_id
  )
  VALUES (
    p_appointment_id,
    p_amount,
    'gift_card',
    p_note,
    p_receipt_urls,
    (CASE WHEN array_length(p_receipt_urls, 1) > 0 THEN p_receipt_urls[1] ELSE NULL END),
    COALESCE(p_tip_amount, 0),
    p_tip_to_staff_id
  )
  RETURNING id INTO v_payment_id;

  RETURN QUERY
    SELECT v_payment_id, v_tx_id, v_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION redeem_gift_card_with_payment(text, numeric, uuid, text, numeric, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_gift_card_with_payment(text, numeric, uuid, text, numeric, uuid, text[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
