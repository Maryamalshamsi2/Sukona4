-- migration-031-receipt-currency.sql
--
-- The public receipt page needs to render amounts in the salon's
-- currency (per migration 030). Its data source is the
-- get_receipt_context RPC, which is security-definer (anon callers
-- can't read salons directly). Adding salon_currency to the RPC's
-- return type — Postgres requires a drop-and-recreate when the
-- shape changes, so the rest of the function body is restated as-is.

drop function if exists get_receipt_context(text);

create function get_receipt_context(p_token text)
returns table (
  appointment_id uuid,
  receipt_number text,
  client_name text,
  client_phone text,
  appointment_date date,
  appointment_time time,
  appointment_status text,
  service_lines jsonb,
  payment_lines jsonb,
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
  salon_currency text,
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
  select a.id, a.salon_id
    into v_appointment_id, v_salon_id
  from appointments a
  where a.receipt_token = p_token;

  if v_appointment_id is null then
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', s.name,
    'price', s.price
  ) order by aps.sort_order, aps.id), '[]'::jsonb)
    into v_service_lines
  from appointment_services aps
  join services s on s.id = aps.service_id
  where aps.appointment_id = v_appointment_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'amount', p.amount,
    'method', p.method,
    'paid_at', p.created_at
  ) order by p.created_at), '[]'::jsonb)
    into v_payment_lines
  from payments p
  where p.appointment_id = v_appointment_id;

  select coalesce(sum(s.price), 0) into v_subtotal
  from appointment_services aps
  join services s on s.id = aps.service_id
  where aps.appointment_id = v_appointment_id;

  select coalesce(sum(p.amount), 0) into v_total_paid
  from payments p where p.appointment_id = v_appointment_id;

  select sa.vat_percent into v_vat_percent
  from salons sa where sa.id = v_salon_id;

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
    sa.currency as salon_currency,
    (a.status = 'cancelled') as is_voided
  from appointments a
  join clients c on c.id = a.client_id
  join salons sa on sa.id = a.salon_id
  where a.id = v_appointment_id;
end;
$$;

grant execute on function get_receipt_context(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
