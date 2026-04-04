-- Add time column to expenses
alter table expenses add column if not exists time time;

-- Create storage bucket for receipts
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload/read receipts
create policy "Authenticated users can upload receipts"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts');

create policy "Authenticated users can read receipts"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipts');

create policy "Authenticated users can delete receipts"
  on storage.objects for delete to authenticated
  using (bucket_id = 'receipts');

create policy "Public can read receipts"
  on storage.objects for select to anon
  using (bucket_id = 'receipts');
