-- migration-029-private-petty-cash.sql
--
-- Plug the petty-cash-log leak for private expenses.
--
-- When the owner logs a private expense paid from petty cash, the
-- expenses action also writes a withdrawal entry to petty_cash_log
-- with description "Expense: <description>". petty_cash_log is
-- visible to all salon members (necessary for the balance to
-- reconcile across roles), so staff could read the private
-- description there even though the expenses table hides the row.
--
-- Approach: carry the privacy bit on the petty_cash_log row, then
-- the read action redacts the description to a generic
-- "Private expense" for staff readers. Amount + timestamp + balance
-- still reflect reality so totals don't diverge between roles.

ALTER TABLE petty_cash_log
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
