-- Upgrade expenses table: add receipt_url and expense_type
alter table expenses add column if not exists expense_type text not null default 'general';
alter table expenses add column if not exists receipt_url text;
alter table expenses add column if not exists notes text;

-- Upgrade inventory table: add unit, category, cost_per_unit
alter table inventory add column if not exists category text not null default 'general';
alter table inventory add column if not exists unit text not null default 'pcs';
alter table inventory add column if not exists cost_per_unit numeric(10, 2);
alter table inventory add column if not exists notes text;

-- Create Supabase storage bucket for receipts (run this separately in Supabase dashboard if needed)
-- insert into storage.buckets (id, name, public) values ('receipts', 'receipts', true);
