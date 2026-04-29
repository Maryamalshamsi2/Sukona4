-- ============================================
-- MIGRATION 019: Receipt system
--
-- Each appointment that has been paid for gets a unique URL token →
-- public receipt page at /receipt/[token]. The receipt page is print-
-- styled (no PDF library; the browser's "Save as PDF" handles it).
--
-- Receipt numbers are sequential per salon, reset yearly:
--   RCT-2026-0001, RCT-2026-0002, ...
--
-- VAT is per-salon configurable. Default 0 (Ateeq doesn't charge VAT).
-- When > 0, salons must also set their TRN so receipts are legally valid.
--
-- Surfaces:
--   - salons.vat_percent                    (numeric, default 0)
--   - salons.vat_trn                        (text)
--   - appointments.receipt_token            (unique, unguessable URL slug)
--   - appointments.receipt_number           (e.g. "RCT-2026-0042")
--   - appointments.receipt_sent_at          (when staff shared it)
--   - salon_receipt_counters                (atomic per-salon-per-year sequence)
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

-- 1) Salon-level VAT settings.
alter table salons
  add column if not exists vat_percent numeric(5, 2) not null default 0,
  add column if not exists vat_trn text;

-- Sanity bounds — VAT can't be negative or absurdly high.
alter table salons drop constraint if exists salons_vat_percent_check;
alter table salons add constraint salons_vat_percent_check
  check (vat_percent >= 0 and vat_percent <= 100);

-- 2) Appointment receipt columns.
alter table appointments
  add column if not exists receipt_token text,
  add column if not exists receipt_number text,
  add column if not exists receipt_sent_at timestamptz;

create unique index if not exists appointments_receipt_token_key
  on appointments (receipt_token)
  where receipt_token is not null;

-- Receipt numbers must be unique per salon, but null until issued.
create unique index if not exists appointments_receipt_number_key
  on appointments (salon_id, receipt_number)
  where receipt_number is not null;

-- 3) Counter table — one row per (salon, year) tracks the last issued seq.
-- Using a table + on-conflict-update is atomic and per-tenant, which is
-- safer than a single global sequence (no info leak between tenants and
-- no contention across salons).
create table if not exists salon_receipt_counters (
  salon_id uuid not null references salons on delete cascade,
  year integer not null,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (salon_id, year)
);

alter table salon_receipt_counters enable row level security;

-- Counter is internal — only RPCs (security definer) read/write it.
-- No explicit policies = no direct access from authenticated/anon roles.

-- 4) RPC: atomically mint a receipt for an appointment.
-- Idempotent: if a receipt_token already exists, returns it as-is.
-- Otherwise generates a token, increments the per-salon-per-year counter,
-- formats the number, and writes both back to the appointment.
create or replace function mint_receipt_for_appointment(
  p_appointment_id uuid
)
returns table (
  receipt_token text,
  receipt_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_id uuid;
  v_existing_token text;
  v_existing_number text;
  v_year integer;
  v_seq integer;
  v_token text;
  v_number text;
begin
  -- Fetch the appointment + check it exists.
  select a.salon_id, a.receipt_token, a.receipt_number
    into v_salon_id, v_existing_token, v_existing_number
  from appointments a
  where a.id = p_appointment_id;

  if v_salon_id is null then
    raise exception 'Appointment not found';
  end if;

  -- Idempotent fast-path.
  if v_existing_token is not null then
    return query select v_existing_token, v_existing_number;
    return;
  end if;

  v_year := extract(year from now())::integer;

  -- Atomic counter bump. ON CONFLICT branch is what fires for every call
  -- after the first in a given (salon, year).
  insert into salon_receipt_counters (salon_id, year, last_seq)
  values (v_salon_id, v_year, 1)
  on conflict (salon_id, year) do update
    set last_seq = salon_receipt_counters.last_seq + 1,
        updated_at = now()
  returning last_seq into v_seq;

  v_number := 'RCT-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');

  -- Token: 16 base64url chars (~96 bits entropy). gen_random_bytes is
  -- pgcrypto; salons should already have it from earlier migrations.
  v_token := replace(replace(replace(
    encode(gen_random_bytes(12), 'base64'),
    '+', '-'), '/', '_'), '=', '');

  update appointments
    set receipt_token = v_token,
        receipt_number = v_number
    where id = p_appointment_id;

  return query select v_token, v_number;
end;
$$;

revoke all on function mint_receipt_for_appointment(uuid) from public;
grant execute on function mint_receipt_for_appointment(uuid) to authenticated, service_role;

-- 5) RPC: resolve a receipt by token for the public receipt page.
-- security definer so anon (no login) can fetch the receipt + salon brand
-- + line items + payment summary in one round-trip.
--
-- Returns null (no rows) if the token doesn't exist.
create or replace function get_receipt_context(p_token text)
returns table (
  appointment_id uuid,
  receipt_number text,
  client_name text,
  client_phone text,
  appointment_date date,
  appointment_time time,
  appointment_status text,
  service_lines jsonb,         -- [{ name, price }]
  payment_lines jsonb,         -- [{ amount, method, paid_at }]
  subtotal numeric,
  vat_percent numeric,
  vat_amount numeric,
  total_paid numeric,
  total_due numeric,
  salon_id uuid,
  salon_name text,
  salon_phone text,
  salon_brand_color text,
  salon_signoff text,
  salon_vat_trn text,
  is_voided boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_appointment_id uuid;
  v_salon_id uuid;
  v_subtotal numeric;
  v_vat_percent numeric;
  v_vat_amount numeric;
  v_total_paid numeric;
  v_service_lines jsonb;
  v_payment_lines jsonb;
begin
  -- Find the appointment by token.
  select a.id, a.salon_id
    into v_appointment_id, v_salon_id
  from appointments a
  where a.receipt_token = p_token;

  if v_appointment_id is null then
    return; -- empty result set
  end if;

  -- Service lines: name + price, ordered by sort_order.
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', s.name,
    'price', s.price
  ) order by aps.sort_order, aps.id), '[]'::jsonb)
    into v_service_lines
  from appointment_services aps
  join services s on s.id = aps.service_id
  where aps.appointment_id = v_appointment_id;

  -- Payment lines: amount + method + when paid.
  select coalesce(jsonb_agg(jsonb_build_object(
    'amount', p.amount,
    'method', p.method,
    'paid_at', p.created_at
  ) order by p.created_at), '[]'::jsonb)
    into v_payment_lines
  from payments p
  where p.appointment_id = v_appointment_id;

  -- Totals.
  select coalesce(sum(s.price), 0) into v_subtotal
  from appointment_services aps
  join services s on s.id = aps.service_id
  where aps.appointment_id = v_appointment_id;

  select coalesce(sum(p.amount), 0) into v_total_paid
  from payments p where p.appointment_id = v_appointment_id;

  select sa.vat_percent into v_vat_percent
  from salons sa where sa.id = v_salon_id;

  -- VAT is computed on the subtotal (services price). The total due is
  -- subtotal + VAT. If the customer paid less, we still show what was due.
  v_vat_amount := round((v_subtotal * coalesce(v_vat_percent, 0) / 100)::numeric, 2);

  return query
  select
    a.id as appointment_id,
    a.receipt_number,
    c.name as client_name,
    c.phone as client_phone,
    a.date as appointment_date,
    a.time as appointment_time,
    a.status::text as appointment_status,
    v_service_lines as service_lines,
    v_payment_lines as payment_lines,
    v_subtotal as subtotal,
    coalesce(v_vat_percent, 0) as vat_percent,
    v_vat_amount as vat_amount,
    v_total_paid as total_paid,
    (v_subtotal + v_vat_amount) as total_due,
    sa.id as salon_id,
    sa.name as salon_name,
    sa.contact_phone as salon_phone,
    sa.brand_color as salon_brand_color,
    sa.signoff as salon_signoff,
    sa.vat_trn as salon_vat_trn,
    (a.status = 'cancelled') as is_voided
  from appointments a
  join clients c on c.id = a.client_id
  join salons sa on sa.id = a.salon_id
  where a.id = v_appointment_id;
end;
$$;

revoke all on function get_receipt_context(text) from public;
grant execute on function get_receipt_context(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
