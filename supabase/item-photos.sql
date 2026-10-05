-- Asia Medicorp IMS
-- Item photo storage setup.
-- Run this entire script once in the Supabase SQL Editor.

insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do update
set public = false;

drop policy if exists "Authenticated users can view item photos" on storage.objects;
create policy "Authenticated users can view item photos"
on storage.objects
for select
to authenticated
using (bucket_id = 'item-photos');

drop policy if exists "Admins and managers can upload item photos" on storage.objects;
create policy "Admins and managers can upload item photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'item-photos'
  and public.current_user_role() in ('admin', 'manager')
);

drop policy if exists "Admins and managers can update item photos" on storage.objects;
create policy "Admins and managers can update item photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'item-photos'
  and public.current_user_role() in ('admin', 'manager')
)
with check (
  bucket_id = 'item-photos'
  and public.current_user_role() in ('admin', 'manager')
);

drop policy if exists "Admins and managers can delete item photos" on storage.objects;
create policy "Admins and managers can delete item photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'item-photos'
  and public.current_user_role() in ('admin', 'manager')
);

-- Managers should be able to remove operational item-photo records too.
drop policy if exists "Admins can delete item_photos" on public.item_photos;
drop policy if exists "Admins and managers can delete item_photos" on public.item_photos;
create policy "Admins and managers can delete item_photos"
on public.item_photos
for delete
to authenticated
using (public.current_user_role() in ('admin', 'manager'));
