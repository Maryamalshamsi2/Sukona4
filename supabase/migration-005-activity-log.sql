-- Activity log table for tracking all actions
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  action text not null,          -- 'created', 'status_updated', 'edited', 'cancelled', 'time_changed', 'block_created', 'block_deleted'
  description text not null,     -- human-readable description
  old_value text,                -- previous status / time (optional)
  new_value text,                -- new status / time (optional)
  performed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- RLS
alter table public.activity_log enable row level security;

create policy "Authenticated users can read activity_log"
  on public.activity_log for select to authenticated using (true);

create policy "Authenticated users can insert activity_log"
  on public.activity_log for insert to authenticated with check (true);

-- Index for fast recent queries
create index if not exists idx_activity_log_created_at on public.activity_log(created_at desc);
create index if not exists idx_activity_log_appointment_id on public.activity_log(appointment_id);
