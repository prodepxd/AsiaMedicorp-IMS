-- Asia Medicorp IMS
-- Machine/component installation relationships.
-- This is an incremental migration for the existing live database.
-- DO NOT run inventory-redesign.sql for this change.

begin;

create table if not exists public.machine_components (
  id uuid primary key default gen_random_uuid(),
  machine_item_id uuid not null references public.items(id) on delete cascade,
  component_item_id uuid not null references public.items(id) on delete cascade,
  installed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (component_item_id)
);

create index if not exists machine_components_machine_idx
  on public.machine_components(machine_item_id);

create index if not exists machine_components_component_idx
  on public.machine_components(component_item_id);

-- A machine may have many probes, boards, PSUs and hard disks.
-- A machine may have at most one monitor and at most one keyboard.
-- PostgreSQL partial indexes cannot use a subquery against items, so these
-- two cardinality rules are enforced by the validation trigger below.

create or replace function public.validate_machine_component_relationship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  machine_type text;
  component_type text;
  component_status text;
  existing_count integer;
begin
  select item_type into machine_type
  from public.items
  where id = new.machine_item_id;

  if machine_type is distinct from 'Machine' then
    raise exception 'Only Machine items can contain components';
  end if;

  select item_type into component_type
  from public.items
  where id = new.component_item_id;

  if component_type is null then
    raise exception 'Component item does not exist';
  end if;

  if component_type not in ('Probe','Board','PSU','Monitor','Hard Disk','Keyboard') then
    raise exception 'This item type cannot be installed in a machine';
  end if;

  select s.name into component_status
  from public.items i
  join public.inventory_statuses s on s.id = i.inventory_status_id
  where i.id = new.component_item_id;

  if component_status is distinct from 'Idle' then
    raise exception 'Only Idle components can be installed in a machine';
  end if;

  if component_type in ('Monitor','Keyboard') then
    select count(*) into existing_count
    from public.machine_components mc
    join public.items i on i.id = mc.component_item_id
    where mc.machine_item_id = new.machine_item_id
      and i.item_type = component_type
      and mc.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if existing_count > 0 then
      raise exception 'A machine can have only one %', component_type;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists machine_components_validate on public.machine_components;

create trigger machine_components_validate
before insert on public.machine_components
for each row
execute function public.validate_machine_component_relationship();

create or replace function public.machine_components_set_in_machine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  in_machine_inventory_status_id uuid;
begin
  select id into in_machine_inventory_status_id
  from public.inventory_statuses
  where name = 'In Machine'
    and is_active = true
  order by id
  limit 1;

  if in_machine_inventory_status_id is null then
    raise exception 'Inventory Status "In Machine" was not found in the Statuses master data';
  end if;

  update public.items
  set inventory_status_id = in_machine_inventory_status_id,
      updated_at = now()
  where id = new.component_item_id;

  return new;
end;
$$;

drop trigger if exists machine_components_after_insert on public.machine_components;

create trigger machine_components_after_insert
after insert on public.machine_components
for each row
execute function public.machine_components_set_in_machine();

create or replace function public.machine_components_set_idle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  idle_inventory_status_id uuid;
begin
  select id into idle_inventory_status_id
  from public.inventory_statuses
  where name = 'Idle'
    and is_active = true
  order by id
  limit 1;

  if idle_inventory_status_id is null then
    raise exception 'Inventory Status "Idle" was not found in the Statuses master data';
  end if;

  update public.items
  set inventory_status_id = idle_inventory_status_id,
      updated_at = now()
  where id = old.component_item_id;

  return old;
end;
$$;

drop trigger if exists machine_components_after_delete on public.machine_components;

create trigger machine_components_after_delete
after delete on public.machine_components
for each row
execute function public.machine_components_set_idle();

-- Prevent an installed component from being manually changed away from
-- "In Machine" while it is still attached to a machine.
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
    select 1
    from public.machine_components mc
    where mc.component_item_id = old.id
  ) into attached;

  if attached and old_status = 'In Machine' and new_status is distinct from 'In Machine' then
    raise exception 'Remove the component from its machine before changing its status';
  end if;

  return new;
end;
$$;

drop trigger if exists items_prevent_invalid_installed_status on public.items;

create trigger items_prevent_invalid_installed_status
before update of inventory_status_id on public.items
for each row
execute function public.prevent_invalid_installed_component_status();

alter table public.machine_components enable row level security;

drop policy if exists "machine_components_read" on public.machine_components;
create policy "machine_components_read"
on public.machine_components
for select
to authenticated
using (true);

drop policy if exists "machine_components_insert" on public.machine_components;
create policy "machine_components_insert"
on public.machine_components
for insert
to authenticated
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists "machine_components_delete" on public.machine_components;
create policy "machine_components_delete"
on public.machine_components
for delete
to authenticated
using (public.current_user_role() in ('admin','manager'));

commit;
