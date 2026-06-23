-- Migration 053: gift_cards.recipient_client_id
--
-- A gift card is usually bought by one person FOR another. The
-- existing client_id captures only the buyer; the recipient — who
-- will actually walk in and redeem the card — had nowhere to live.
-- Salon owners worked around this by stuffing both names into the
-- notes field, which doesn't surface in search, doesn't link to a
-- client row, and breaks any future "notify recipient by WhatsApp"
-- flow.
--
-- This migration adds a nullable recipient_client_id. Behaviour:
--   * Both NULL → bearer card (anyone with the code can redeem;
--     same as today).
--   * recipient_client_id NULL but client_id set → card is for the
--     buyer themselves (also the legacy interpretation).
--   * Both set → buyer ≠ recipient. The buyer paid; the recipient
--     is the intended user.
--
-- The recipient is NOT enforced at redemption time — the code is
-- still bearer-redeemable, matching how a physical voucher works.
-- The field is informational (search, audit, future "notify
-- recipient" templates) not access-control.
--
-- ON DELETE SET NULL: deleting the recipient client just nulls the
-- pointer rather than cascading. The card itself outlives the
-- client row (e.g. they wandered off — the card balance is still
-- legitimate and can be redeemed by anyone holding the code).

alter table gift_cards
  add column if not exists recipient_client_id uuid
    references clients(id) on delete set null;

-- Index on the FK for the eventual "all cards for client X" lookup
-- (currently we only filter by buyer client_id; once the detail
-- page surfaces both, the same client may want to see cards they
-- were the recipient of too).
create index if not exists gift_cards_recipient_idx
  on gift_cards (recipient_client_id)
  where recipient_client_id is not null;

NOTIFY pgrst, 'reload schema';
