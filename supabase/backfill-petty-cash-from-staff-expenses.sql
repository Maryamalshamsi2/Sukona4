-- backfill-petty-cash-from-staff-expenses.sql
--
-- One-off cleanup. Before the staff-petty-cash fix, staff could
-- create expenses with paid_from_petty_cash=false (either by
-- toggling the now-hidden UI switch or because the form sent it
-- that way) and the petty_cash_log never got a withdrawal entry.
--
-- This script finds every staff-created expense that:
--   1. has no corresponding petty_cash_log row (so no withdrawal
--      was recorded), AND
--   2. is NOT marked is_private (staff expenses are never private
--      by design — private is owner-only).
--
-- For each match, it flips the expense's paid_from_petty_cash flag
-- to true AND inserts the missing withdrawal log row. Idempotent —
-- safe to re-run.
--
-- Review the SELECT first to see what would change before running
-- the INSERT + UPDATE. Wrap in a transaction so you can ROLLBACK
-- if anything looks wrong.

BEGIN;

-- 1. Preview: list every staff-created expense missing a log entry.
SELECT
  e.id,
  e.description,
  e.amount,
  e.date,
  e.paid_from_petty_cash,
  p.full_name AS created_by_name,
  p.role     AS created_by_role
FROM expenses e
LEFT JOIN profiles p ON p.id = e.created_by
WHERE p.role = 'staff'
  AND NOT EXISTS (
    SELECT 1 FROM petty_cash_log l WHERE l.expense_id = e.id
  )
ORDER BY e.date DESC, e.created_at DESC;

-- 2. Insert the missing withdrawal log rows. salon_id auto-fills
-- from the expense's salon via the column default — but we also
-- write it explicitly to be safe regardless of session context.
-- is_private is intentionally omitted so this script runs whether
-- or not migration-029 has been applied (if the column exists, it
-- defaults to false; if not, it isn't referenced).
INSERT INTO petty_cash_log (amount, type, description, expense_id, created_by, salon_id)
SELECT
  e.amount,
  'withdrawal',
  'Expense: ' || e.description,
  e.id,
  e.created_by,
  e.salon_id
FROM expenses e
JOIN profiles p ON p.id = e.created_by
WHERE p.role = 'staff'
  AND NOT EXISTS (
    SELECT 1 FROM petty_cash_log l WHERE l.expense_id = e.id
  );

-- 3. Flip the expense flag so the row's own paid_from_petty_cash
-- field matches reality. updated_at is intentionally not touched —
-- not every deployed schema has the column, and the backfill works
-- without bumping it.
UPDATE expenses e
SET paid_from_petty_cash = true
FROM profiles p
WHERE p.id = e.created_by
  AND p.role = 'staff'
  AND e.paid_from_petty_cash = false
  AND EXISTS (
    SELECT 1 FROM petty_cash_log l WHERE l.expense_id = e.id
  );

-- 4. Verify: balance should now reflect today's staff expenses.
SELECT
  s.id AS salon_id,
  s.name,
  SUM(CASE WHEN l.type = 'deposit'    THEN l.amount ELSE 0 END)
    - SUM(CASE WHEN l.type = 'withdrawal' THEN l.amount ELSE 0 END)
    AS petty_cash_balance
FROM salons s
LEFT JOIN petty_cash_log l ON l.salon_id = s.id
GROUP BY s.id, s.name
ORDER BY s.name;

-- If the numbers look right, COMMIT. Otherwise ROLLBACK.
-- Replace this line with COMMIT; or ROLLBACK; as appropriate.
COMMIT;
