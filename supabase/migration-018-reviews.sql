-- ============================================
-- MIGRATION 018: Internal review system
--
-- The "review filter" pattern: each completed/paid appointment gets a
-- unique URL token. Tapping the link shows a 5-star review prompt.
--   • 4–5 stars → redirected to the salon's public_review_url (Google etc.)
--   • 1–3 stars → captured internally so the salon can address issues
--                 privately, without public reputation damage.
--
-- Two surfaces:
--   - appointments.review_token       (unique, unguessable, public URL slug)
--   - appointments.review_sent_at     (timestamp the link was shared)
--   - reviews                         (one row per submitted review)
--
-- Idempotent: safe to re-run.
-- ============================================

begin;

-- 1) Add review tracking columns to appointments.
alter table appointments
  add column if not exists review_token text,
  add column if not exists review_sent_at timestamptz;

-- Unique index on review_token so the public page can look up by token.
-- Partial index — only enforces uniqueness for non-null tokens.
create unique index if not exists appointments_review_token_key
  on appointments (review_token)
  where review_token is not null;

-- 2) reviews table — one row per submission.
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references appointments on delete cascade,
  salon_id uuid not null references salons on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  wants_followup boolean not null default false,
  -- True when rating ≥ 4 and the salon has a public_review_url set, meaning
  -- the customer was redirected externally after rating. We still record
  -- the rating internally for analytics ("how many 5-star intents did we get?").
  redirected_externally boolean not null default false,
  submitted_at timestamptz not null default now(),
  -- One review per appointment.
  unique(appointment_id)
);

create index if not exists reviews_salon_id_idx on reviews (salon_id);
create index if not exists reviews_submitted_at_idx on reviews (submitted_at desc);

alter table reviews enable row level security;

-- Owner + admin can read reviews for their salon. RLS uses the existing
-- current_user_salon_id() helper from migration 014.
drop policy if exists "Owner/admin can read reviews" on reviews;
create policy "Owner/admin can read reviews"
  on reviews for select to authenticated
  using (
    salon_id = current_user_salon_id()
    and is_owner_or_admin()
  );

-- Anyone (including anon) can insert via the public review page.
-- The submitReview server action validates the token before inserting,
-- so this policy intentionally allows the row in — the token check
-- happens in app code, not at the DB level.
drop policy if exists "Anyone can submit a review" on reviews;
create policy "Anyone can submit a review"
  on reviews for insert to anon, authenticated
  with check (true);

-- 3) Allow anon role to read appointments + salons via the review token only.
-- The public review page resolves /r/[token] → appointment + salon brand
-- without a login. We expose just the columns needed via two RPCs below.

-- 4) RPC: resolve an appointment + salon brand for the public review page.
-- Returns null if the token doesn't exist. security definer so it can read
-- appointments + salons without going through RLS (which would block anon).
create or replace function get_review_context(p_token text)
returns table (
  appointment_id uuid,
  client_name text,
  service_summary text,
  appointment_date date,
  salon_id uuid,
  salon_name text,
  brand_color text,
  public_review_url text,
  already_submitted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id as appointment_id,
    c.name as client_name,
    coalesce(
      (
        select string_agg(s.name, ', ' order by aps.sort_order)
        from appointment_services aps
        join services s on s.id = aps.service_id
        where aps.appointment_id = a.id
      ),
      'your appointment'
    ) as service_summary,
    a.date as appointment_date,
    sa.id as salon_id,
    sa.name as salon_name,
    sa.brand_color,
    sa.public_review_url,
    exists(select 1 from reviews r where r.appointment_id = a.id) as already_submitted
  from appointments a
  join clients c on c.id = a.client_id
  join salons sa on sa.id = a.salon_id
  where a.review_token = p_token;
$$;

revoke all on function get_review_context(text) from public;
grant execute on function get_review_context(text) to anon, authenticated, service_role;

-- 5) RPC: submit a review by token. Validates the token, inserts the review,
-- and returns the public_review_url to redirect to (or null).
-- security definer to bypass RLS (the token IS the auth here).
create or replace function submit_review_by_token(
  p_token text,
  p_rating integer,
  p_comment text,
  p_wants_followup boolean
)
returns table (
  ok boolean,
  redirect_url text,
  error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment_id uuid;
  v_salon_id uuid;
  v_public_review_url text;
  v_redirected boolean;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return query select false, null::text, 'Rating must be between 1 and 5'::text;
    return;
  end if;

  select a.id, a.salon_id, sa.public_review_url
    into v_appointment_id, v_salon_id, v_public_review_url
  from appointments a
  join salons sa on sa.id = a.salon_id
  where a.review_token = p_token;

  if v_appointment_id is null then
    return query select false, null::text, 'Invalid or expired review link'::text;
    return;
  end if;

  if exists(select 1 from reviews r where r.appointment_id = v_appointment_id) then
    return query select false, null::text, 'A review has already been submitted for this appointment'::text;
    return;
  end if;

  -- 4-5 star + a configured public URL = redirect outward.
  v_redirected := (p_rating >= 4 and v_public_review_url is not null and length(trim(v_public_review_url)) > 0);

  insert into reviews (
    appointment_id, salon_id, rating, comment, wants_followup, redirected_externally
  ) values (
    v_appointment_id,
    v_salon_id,
    p_rating,
    nullif(trim(coalesce(p_comment, '')), ''),
    coalesce(p_wants_followup, false),
    v_redirected
  );

  return query select true, case when v_redirected then v_public_review_url else null::text end, null::text;
end;
$$;

revoke all on function submit_review_by_token(text, integer, text, boolean) from public;
grant execute on function submit_review_by_token(text, integer, text, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
