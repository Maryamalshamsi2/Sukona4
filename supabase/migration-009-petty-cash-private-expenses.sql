-- Migration 009: Petty cash tracking + private expenses
-- Run this in Supabase SQL Editor

-- 1. Add is_private and paid_from_petty_cash to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_private boolean DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_from_petty_cash boolean DEFAULT false;

-- 2. Create petty cash log table
CREATE TABLE IF NOT EXISTS petty_cash_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  amount numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  description text NOT NULL,
  expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE petty_cash_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for petty_cash_log (all authenticated users can read, owners/admins can write)
CREATE POLICY "Authenticated users can view petty cash log"
  ON petty_cash_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert petty cash log"
  ON petty_cash_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update petty cash log"
  ON petty_cash_log FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete petty cash log"
  ON petty_cash_log FOR DELETE
  TO authenticated
  USING (true);
