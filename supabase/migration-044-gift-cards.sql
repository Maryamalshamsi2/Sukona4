-- migration-044-gift-cards.sql
--
-- Gift cards — Phase 2 of the sales feature plan sketched in
-- migration-043. A gift card is sold (cash comes in) but is NOT revenue
-- at sale time — it's an outstanding liability. Revenue is recognized
-- only when the customer redeems against an appointment.
--
-- Two tables:
--   gift_cards               — one row per card (current state)
--   gift_card_transactions   — append-only log (sale / redemption /
--                              void / manual adjust)
--
-- The transactions table is what Reports reads from for the Revenue
-- line (sum of type='redemption' in the date range). The gift_cards
-- table tracks the current balance and outstanding liability.
--
-- RLS shape (matches the user's choice — owner/admin sell, staff can
-- look up codes and redeem at the appointment payment screen):
--   gift_cards:
--     - owner/admin: full CRUD
--     - staff:       SELECT only (needed to look up codes / show
--                    customer name in the payment modal)
--     - balance changes happen ONLY via the redeem_gift_card()
--       SECURITY DEFINER function — no direct UPDATE for staff
--   gift_card_transactions:
--     - owner/admin: full CRUD
--     - staff:       SELECT (history on receipts), INSERT restricted
--                    to type='redemption' for their salon
--
-- Code format is enforced in the server action, not the DB — DB only
-- enforces uniqueness and non-empty.

CREATE TABLE IF NOT EXISTS gift_cards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id        uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  code            text NOT NULL UNIQUE,
  initial_amount  numeric(10, 2) NOT NULL CHECK (initial_amount > 0),
  balance         numeric(10, 2) NOT NULL CHECK (balance >= 0),
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'redeemed', 'void')),
  -- How the buyer paid for the card. Cash/card matters for daily
  -- reconciliation even though the SALE itself isn't revenue.
  purchase_method text NOT NULL DEFAULT 'cash'
                    CHECK (purchase_method IN ('cash', 'card', 'other')),
  expires_at      date,
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  notes           text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- balance must never exceed initial_amount (defensive — server
  -- actions also check, this is the last line)
  CONSTRAINT balance_within_initial CHECK (balance <= initial_amount)
);

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id        uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  gift_card_id    uuid NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  type            text NOT NULL
                    CHECK (type IN ('sale', 'redemption', 'void', 'adjust')),
  -- amount is always stored POSITIVE; sign is implied by `type`.
  -- Sale = liability up, redemption = revenue up + liability down.
  amount          numeric(10, 2) NOT NULL CHECK (amount > 0),
  appointment_id  uuid REFERENCES appointments(id) ON DELETE SET NULL,
  notes           text,
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Hot read paths.
-- Lookups by code (already UNIQUE on gift_cards.code, so a btree
-- already exists — no extra index needed for that).
-- Reports queries scan transactions by salon + date window:
CREATE INDEX IF NOT EXISTS idx_gift_card_tx_salon_date
  ON gift_card_transactions(salon_id, created_at DESC);
-- List page filters by status:
CREATE INDEX IF NOT EXISTS idx_gift_cards_salon_status
  ON gift_cards(salon_id, status, created_at DESC);
-- History panel for a single card:
CREATE INDEX IF NOT EXISTS idx_gift_card_tx_card
  ON gift_card_transactions(gift_card_id, created_at DESC);

ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- gift_cards policies
-- ============================================

-- Owner/admin: full CRUD on their salon's cards.
DROP POLICY IF EXISTS "Owner/admin manage gift_cards" ON gift_cards;
CREATE POLICY "Owner/admin manage gift_cards"
  ON gift_cards FOR ALL TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  )
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  );

-- Staff: SELECT only — needed to look up codes during payment and
-- to show the customer name in the modal. Staff NEVER directly
-- INSERT/UPDATE/DELETE on this table; balance changes go through
-- redeem_gift_card() below.
DROP POLICY IF EXISTS "Staff read gift_cards" ON gift_cards;
CREATE POLICY "Staff read gift_cards"
  ON gift_cards FOR SELECT TO authenticated
  USING (salon_id = current_user_salon_id());

-- ============================================
-- gift_card_transactions policies
-- ============================================

-- Owner/admin: full CRUD.
DROP POLICY IF EXISTS "Owner/admin manage gift_card_transactions"
  ON gift_card_transactions;
CREATE POLICY "Owner/admin manage gift_card_transactions"
  ON gift_card_transactions FOR ALL TO authenticated
  USING (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  )
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND is_owner_or_admin()
  );

-- Staff: SELECT in their salon (so receipts can show redemption
-- history if we ever surface it there).
DROP POLICY IF EXISTS "Staff read gift_card_transactions"
  ON gift_card_transactions;
CREATE POLICY "Staff read gift_card_transactions"
  ON gift_card_transactions FOR SELECT TO authenticated
  USING (salon_id = current_user_salon_id());

-- Staff: INSERT only for 'redemption' transactions in their salon.
-- 'sale', 'void', 'adjust' all require owner/admin (covered by the
-- policy above).
DROP POLICY IF EXISTS "Staff insert gift_card redemption"
  ON gift_card_transactions;
CREATE POLICY "Staff insert gift_card redemption"
  ON gift_card_transactions FOR INSERT TO authenticated
  WITH CHECK (
    salon_id = current_user_salon_id()
    AND type = 'redemption'
  );

-- ============================================
-- redeem_gift_card(): the only path that mutates gift_cards.balance
-- ============================================
--
-- SECURITY DEFINER because staff can't UPDATE gift_cards directly.
-- The function:
--   - Locks the gift_card row (FOR UPDATE) to avoid concurrent
--     double-spend
--   - Enforces same-salon, status='active', expiry, sufficient balance
--   - Decrements balance, flips status to 'redeemed' if balance hits 0
--   - Inserts the corresponding gift_card_transactions row
-- Returns the new balance (and the transaction id, in case the caller
-- wants to attach it to a payment record).
--
-- All-or-nothing inside a single transaction. Raises with a clear
-- message on any failure so the server action can surface it to the
-- modal.

CREATE OR REPLACE FUNCTION redeem_gift_card(
  p_code           text,
  p_amount         numeric,
  p_appointment_id uuid DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS TABLE (transaction_id uuid, new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_id    uuid;
  v_salon_id   uuid;
  v_balance    numeric;
  v_status     text;
  v_expires_at date;
  v_user_salon uuid;
  v_tx_id      uuid;
BEGIN
  -- Caller's salon — enforces same-tenant inside SECURITY DEFINER.
  v_user_salon := current_user_salon_id();
  IF v_user_salon IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Redemption amount must be greater than 0';
  END IF;

  -- Lock the card row to prevent race-condition double-spend.
  SELECT id, salon_id, balance, status, expires_at
    INTO v_card_id, v_salon_id, v_balance, v_status, v_expires_at
    FROM gift_cards
    WHERE code = p_code
    FOR UPDATE;

  IF v_card_id IS NULL THEN
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  IF v_salon_id <> v_user_salon THEN
    -- Don't leak that the code exists in another salon.
    RAISE EXCEPTION 'Gift card not found';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Gift card is %', v_status;
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at < CURRENT_DATE THEN
    RAISE EXCEPTION 'Gift card expired on %', v_expires_at;
  END IF;

  IF p_amount > v_balance THEN
    RAISE EXCEPTION
      'Insufficient balance (% available)', v_balance;
  END IF;

  -- Decrement balance; flip to 'redeemed' if zeroed out.
  UPDATE gift_cards
    SET balance = balance - p_amount,
        status  = CASE WHEN balance - p_amount = 0
                       THEN 'redeemed' ELSE status END
    WHERE id = v_card_id;

  -- Log the transaction.
  INSERT INTO gift_card_transactions (
    salon_id, gift_card_id, type, amount,
    appointment_id, notes, created_by
  )
  VALUES (
    v_salon_id, v_card_id, 'redemption', p_amount,
    p_appointment_id, p_notes, auth.uid()
  )
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_tx_id, v_balance - p_amount;
END;
$$;

-- Lock down: only authenticated users can call. (Default GRANT is
-- PUBLIC for new functions — revoke that and grant to authenticated.)
REVOKE ALL ON FUNCTION redeem_gift_card(text, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_gift_card(text, numeric, uuid, text) TO authenticated;

-- ============================================
-- Widen payments.method to accept 'gift_card'
-- ============================================
-- Existing check (set in migration-013) allows cash/card/other.
-- Drop-and-recreate so an appointment paid (partially) via a gift
-- card can store a payments row with method='gift_card'.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'card', 'other', 'gift_card'));

NOTIFY pgrst, 'reload schema';
