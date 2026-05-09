-- migration-026-payment-attachments.sql
--
-- Allow multiple attachments per payment. Before this migration,
-- payments had a single receipt_url (one image / PDF). Salons often
-- need multiple slips per payment — front + back of a card receipt,
-- separate gratuity slip, deposit + balance receipts, etc.
--
-- Approach: add an array column receipt_urls and backfill from the
-- existing receipt_url. Writes after this migration write to the
-- array; reads prefer the array but fall back to the single column
-- so legacy rows still display.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS receipt_urls text[] NOT NULL DEFAULT '{}';

-- Backfill: any row that has a receipt_url but an empty array gets
-- its single URL copied into the array.
UPDATE payments
   SET receipt_urls = ARRAY[receipt_url]
 WHERE receipt_url IS NOT NULL
   AND receipt_url <> ''
   AND coalesce(array_length(receipt_urls, 1), 0) = 0;

NOTIFY pgrst, 'reload schema';
