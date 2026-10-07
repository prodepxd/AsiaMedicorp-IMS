-- Asia Medicorp IMS
-- New Transit module. Incremental migration only.
-- This intentionally does not recreate or restore the removed legacy
-- shipments / shipment_items / transit_events tables.

begin;

create table if not exists public.transit_records (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete restrict,
  from_location_id uuid not null references public.locations(id) on delete restrict,
  to_location_id uuid not null references public.locations(id) on delete restrict,
  transit_status_id uuid not null references public.transit_statuses(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transit_records_different_locations
    check (from_location_id <> to_location_id)
);

create index if not exists transit_records_item_idx
  on public.transit_records(item_id);

create index if not exists transit_records_from_location_idx
  on public.transit_records(from_location_id);

create index if not exists transit_records_to_location_idx
  on public.transit_records(to_location_id);

create index if not exists transit_records_status_idx
  on public.transit_records(transit_status_id);

create index if not exists transit_records_occurred_at_idx
  on public.transit_records(occurred_at desc);

drop trigger if exists transit_records_updated_at on public.transit_records;
create trigger transit_records_updated_at
before update on public.transit_records
for each row
execute function public.set_updated_at();

alter table public.transit_records enable row level security;

grant select, insert, update, delete on public.transit_records to authenticated;

drop policy if exists "transit_records_read" on public.transit_records;
create policy "transit_records_read"
on public.transit_records
for select to authenticated
using (true);

drop policy if exists "transit_records_insert" on public.transit_records;
create policy "transit_records_insert"
on public.transit_records
for insert to authenticated
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists "transit_records_update" on public.transit_records;
create policy "transit_records_update"
on public.transit_records
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists "transit_records_delete" on public.transit_records;
create policy "transit_records_delete"
on public.transit_records
for delete to authenticated
using (public.current_user_role() = 'admin');

commit;
