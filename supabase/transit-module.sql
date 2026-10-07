-- Asia Medicorp IMS
-- Transit module (incremental migration).
-- This creates the new multi-item Transit workflow and does not restore
-- the removed legacy shipments / shipment_items / transit_events tables.

begin;

create table if not exists public.transits (
  id uuid primary key default gen_random_uuid(),
  from_location_id uuid not null references public.locations(id) on delete restrict,
  to_location_id uuid not null references public.locations(id) on delete restrict,
  sender text not null,
  carrier text not null,
  send_at timestamptz not null default now(),
  receiver text,
  receive_at timestamptz,
  notes text,
  progress text not null default 'Stand-By',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transits_different_locations check (from_location_id <> to_location_id),
  constraint transits_progress_check check (progress in ('Stand-By','Moving','Completed')),
  constraint transits_receive_pair_check check (
    (receiver is null and receive_at is null)
    or (receiver is not null and btrim(receiver) <> '' and receive_at is not null)
  )
);

create table if not exists public.transit_items (
  id uuid primary key default gen_random_uuid(),
  transit_id uuid not null references public.transits(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (transit_id, item_id)
);

create index if not exists transits_created_at_idx on public.transits(created_at desc);
create index if not exists transits_progress_idx on public.transits(progress);
create index if not exists transit_items_transit_idx on public.transit_items(transit_id);
create index if not exists transit_items_item_idx on public.transit_items(item_id);

drop trigger if exists transits_updated_at on public.transits;
create trigger transits_updated_at
before update on public.transits
for each row execute function public.set_updated_at();

-- Keep the existing installed-component protection compatible with Transit.
-- A component remains In Machine for normal machine/component operations, but
-- Transit may move it to In Transit / At Location when it belongs to a
-- Transit containing its parent machine.
create or replace function public.prevent_invalid_installed_component_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_status text;
  new_status text;
  attached boolean;
  allowed_transit_move boolean := false;
begin
  if old.item_type not in ('Probe','Board','PSU','Monitor','Hard Disk','Keyboard') then
    return new;
  end if;

  select s.name into old_status
  from public.inventory_statuses s
  where s.id = old.inventory_status_id;

  select s.name into new_status
  from public.inventory_statuses s
  where s.id = new.inventory_status_id;

  select exists (
    select 1 from public.machine_components mc where mc.component_item_id = old.id
  ) into attached;

  if attached and old_status = 'In Machine' and new_status is distinct from 'In Machine' then
    select exists (
      select 1
      from public.transit_items child_ti
      join public.machine_components mc
        on mc.component_item_id = child_ti.item_id
      join public.transit_items machine_ti
        on machine_ti.transit_id = child_ti.transit_id
       and machine_ti.item_id = mc.machine_item_id
      join public.transits t
        on t.id = child_ti.transit_id
      where child_ti.item_id = old.id
        and t.progress in ('Moving','Completed')
        and new_status in ('In Transit','At Location')
    ) into allowed_transit_move;

    if not allowed_transit_move then
      raise exception 'Remove the component from its machine before changing its status';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_invalid_installed_component_status() from public;
grant execute on function public.prevent_invalid_installed_component_status() to authenticated;

-- New Transit records always begin in Stand-By, regardless of a client payload.
create or replace function public.force_transit_standby()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.progress := 'Stand-By';
  end if;

  return new;
end;
$$;

drop trigger if exists transits_force_standby on public.transits;
create trigger transits_force_standby
before insert on public.transits
for each row execute function public.force_transit_standby();

-- Validate Transit item membership and automatically add installed machine
-- components whenever a Machine is added.
create or replace function public.validate_transit_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  transit_progress text;
  item_type text;
  inventory_status text;
  parent_machine_id uuid;
  parent_in_same_transit boolean := false;
begin
  select progress into transit_progress
  from public.transits
  where id = new.transit_id;

  if transit_progress is null then
    raise exception 'Transit does not exist';
  end if;

  if transit_progress = 'Completed' then
    raise exception 'Completed transits cannot have items added';
  end if;

  select i.item_type, s.name
    into item_type, inventory_status
  from public.items i
  left join public.inventory_statuses s on s.id = i.inventory_status_id
  where i.id = new.item_id;

  if item_type is null then
    raise exception 'Inventory item does not exist';
  end if;

  if inventory_status in ('Idle','In Repair','SOLD') then
    return new;
  end if;

  select mc.machine_item_id into parent_machine_id
  from public.machine_components mc
  where mc.component_item_id = new.item_id
  limit 1;

  if parent_machine_id is not null then
    select exists (
      select 1
      from public.transit_items
      where transit_id = new.transit_id
        and item_id = parent_machine_id
    ) into parent_in_same_transit;

    if parent_in_same_transit then
      return new;
    end if;
  end if;

  raise exception 'Only items with Inventory Status Idle, In Repair, or SOLD can be added to a Transit';
end;
$$;

drop trigger if exists transit_items_validate on public.transit_items;
create trigger transit_items_validate
before insert on public.transit_items
for each row execute function public.validate_transit_item();

create or replace function public.add_machine_components_to_transit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select item_type from public.items where id = new.item_id) = 'Machine' then
    insert into public.transit_items (transit_id, item_id)
    select new.transit_id, mc.component_item_id
    from public.machine_components mc
    where mc.machine_item_id = new.item_id
    on conflict (transit_id, item_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists transit_items_add_machine_components on public.transit_items;
create trigger transit_items_add_machine_components
after insert on public.transit_items
for each row execute function public.add_machine_components_to_transit();

-- A component auto-added with its Machine may not be removed independently.
-- Removing the Machine cascades its transit-added children in the application;
-- this trigger blocks direct child deletion while the parent remains included.
create or replace function public.prevent_transit_child_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_machine_id uuid;
  parent_present boolean := false;
begin
  select mc.machine_item_id into parent_machine_id
  from public.machine_components mc
  where mc.component_item_id = old.item_id
  limit 1;

  if parent_machine_id is not null then
    select exists (
      select 1
      from public.transit_items
      where transit_id = old.transit_id
        and item_id = parent_machine_id
    ) into parent_present;

    if parent_present then
      raise exception 'This installed component can only be removed from the Transit by removing its parent Machine';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists transit_items_prevent_child_removal on public.transit_items;
create trigger transit_items_prevent_child_removal
before delete on public.transit_items
for each row execute function public.prevent_transit_child_removal();

-- Apply movement statuses and destination location to every item in a Transit.
create or replace function public.apply_transit_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  in_transit_id uuid;
  at_location_id uuid;
begin
  if new.progress = old.progress then
    return new;
  end if;

  if new.progress = 'Moving' then
    select id into in_transit_id
    from public.inventory_statuses
    where name = 'In Transit' and is_active = true
    order by id
    limit 1;

    if in_transit_id is null then
      raise exception 'Inventory Status "In Transit" was not found';
    end if;

    update public.items i
    set inventory_status_id = in_transit_id,
        updated_at = now()
    where i.id in (
      select ti.item_id from public.transit_items ti where ti.transit_id = new.id
    );

  elsif new.progress = 'Completed' then
    select id into at_location_id
    from public.inventory_statuses
    where name = 'At Location' and is_active = true
    order by id
    limit 1;

    if at_location_id is null then
      raise exception 'Inventory Status "At Location" was not found';
    end if;

    if new.receiver is null or btrim(new.receiver) = '' or new.receive_at is null then
      raise exception 'Receiver and receive date/time are required before completing a Transit';
    end if;

    update public.items i
    set inventory_status_id = at_location_id,
        current_location_id = new.to_location_id,
        updated_at = now()
    where i.id in (
      select ti.item_id from public.transit_items ti where ti.transit_id = new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists transits_apply_progress on public.transits;
create trigger transits_apply_progress
after update of progress on public.transits
for each row execute function public.apply_transit_progress();

alter table public.transits enable row level security;
alter table public.transit_items enable row level security;

grant select, insert, update on public.transits to authenticated;
grant select, insert, update, delete on public.transit_items to authenticated;

drop policy if exists "transits_read" on public.transits;
create policy "transits_read" on public.transits
for select to authenticated using (true);

drop policy if exists "transits_insert" on public.transits;
create policy "transits_insert" on public.transits
for insert to authenticated
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists "transits_update" on public.transits;
create policy "transits_update" on public.transits
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists "transit_items_read" on public.transit_items;
create policy "transit_items_read" on public.transit_items
for select to authenticated using (true);

drop policy if exists "transit_items_insert" on public.transit_items;
create policy "transit_items_insert" on public.transit_items
for insert to authenticated
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists "transit_items_update" on public.transit_items;
create policy "transit_items_update" on public.transit_items
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists "transit_items_delete" on public.transit_items;
create policy "transit_items_delete" on public.transit_items
for delete to authenticated
using (public.current_user_role() in ('admin','manager'));

commit;
