-- Phase 12: atomic inventory/transit operations.
-- Review this file before manually running it in the Supabase SQL Editor.
-- This script replaces only the Phase 12 RPC; it does not modify old SQL scripts.
-- All write operations used by the Transit UI are serialized in PostgreSQL transactions.

begin;

create or replace function public.atomic_inventory_transit_operation(
  p_operation text,
  p_transit_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_item_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_transit_id uuid := p_transit_id;
  v_item_id uuid;
  v_role text;
  v_progress text;
  v_from_location_id uuid;
  v_to_location_id uuid;
  v_sent_at timestamptz;
  v_received_at timestamptz;
  v_transit_item_id uuid;
  v_note text;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Insufficient privileges for inventory operation' using errcode = '42501';
  end if;

  if p_operation not in (
    'create_transit', 'edit_transit', 'start_transit',
    'complete_transit', 'delete_transit', 'save_item_note'
  ) then
    raise exception 'Unsupported atomic inventory operation: %', p_operation using errcode = '22023';
  end if;

  if p_operation = 'save_item_note' then
    v_transit_item_id := nullif(p_payload->>'transit_item_id', '')::uuid;
    if v_transit_item_id is null then
      raise exception 'Transit item history ID is required' using errcode = '22023';
    end if;
    update public.transit_items
       set note = nullif(btrim(p_payload->>'note'), '')
     where id = v_transit_item_id;
    if not found then raise exception 'Transit item history entry not found'; end if;
    return coalesce(p_transit_id, v_transit_item_id);
  end if;

  if p_operation = 'delete_transit' then
    if v_role <> 'admin' then
      raise exception 'Only an admin can delete a Transit' using errcode = '42501';
    end if;
    if v_transit_id is null then raise exception 'Transit ID is required'; end if;
    select transit_progress into v_progress
      from public.transits where id = v_transit_id for update;
    if not found then raise exception 'Transit not found'; end if;
    delete from public.transits where id = v_transit_id;
    return v_transit_id;
  end if;

  if p_operation = 'create_transit' then
    if coalesce(cardinality(p_item_ids), 0) = 0 then
      raise exception 'Select at least one item for the Transit';
    end if;
    if (p_payload->>'from_location_id') is null or (p_payload->>'to_location_id') is null then
      raise exception 'From and To locations are required';
    end if;
    v_from_location_id := (p_payload->>'from_location_id')::uuid;
    v_to_location_id := (p_payload->>'to_location_id')::uuid;
    if v_from_location_id = v_to_location_id then
      raise exception 'From and To locations must be different';
    end if;
    if nullif(btrim(p_payload->>'sender'), '') is null
       or nullif(btrim(p_payload->>'carrier'), '') is null then
      raise exception 'Sender and carrier are required';
    end if;
    if exists (
      select 1 from unnest(p_item_ids) x
      group by x having count(*) > 1
    ) then raise exception 'Duplicate items were submitted'; end if;

    -- Lock selected inventory in a stable order before validating eligibility.
    perform i.id from public.items i
     where i.id = any(p_item_ids) order by i.id for update;
    if (select count(*) from public.items i where i.id = any(p_item_ids))
       <> (select count(distinct x) from unnest(p_item_ids) x) then
      raise exception 'One or more selected items do not exist';
    end if;
    if exists (
      select 1 from public.items i
       where i.id = any(p_item_ids)
         and i.current_location_id is distinct from v_from_location_id
    ) then raise exception 'Every selected item must currently be at the Transit source location'; end if;
    if exists (
      select 1 from public.machine_components mc
       where mc.component_item_id = any(p_item_ids)
         and not (mc.machine_item_id = any(p_item_ids))
    ) then raise exception 'An installed component can only transit with its parent Machine'; end if;
    if exists (
      select 1 from public.machine_components mc
       where mc.machine_item_id = any(p_item_ids)
         and not (mc.component_item_id = any(p_item_ids))
    ) then raise exception 'All installed components must be included when their parent Machine transits'; end if;
    if exists (
      select 1 from public.transit_items ti
      join public.transits t on t.id = ti.transit_id
      where ti.item_id = any(p_item_ids)
        and t.transit_progress in ('stand-by', 'moving')
    ) then raise exception 'One or more selected items already belong to an active Transit'; end if;

    insert into public.transits (
      from_location_id, to_location_id, sender, receiver, carrier,
      sent_at, received_at, note, transit_progress, created_by
    ) values (
      v_from_location_id, v_to_location_id,
      nullif(btrim(p_payload->>'sender'), ''),
      nullif(btrim(p_payload->>'receiver'), ''),
      nullif(btrim(p_payload->>'carrier'), ''),
      null, null, nullif(btrim(p_payload->>'note'), ''),
      'stand-by', auth.uid()
    ) returning id into v_transit_id;

    foreach v_item_id in array p_item_ids loop
      insert into public.transit_items (transit_id, item_id)
      values (v_transit_id, v_item_id);
    end loop;
    return v_transit_id;
  end if;

  if v_transit_id is null then raise exception 'Transit ID is required'; end if;
  select transit_progress, from_location_id, to_location_id, sent_at
    into v_progress, v_from_location_id, v_to_location_id, v_sent_at
    from public.transits where id = v_transit_id for update;
  if not found then raise exception 'Transit not found'; end if;

  if p_operation = 'edit_transit' then
    if v_progress <> 'stand-by' then
      raise exception 'Only stand-by Transits can be edited';
    end if;
    if coalesce(cardinality(p_item_ids), 0) = 0 then
      raise exception 'Select at least one item for the Transit';
    end if;
    if (p_payload->>'from_location_id')::uuid is distinct from v_from_location_id then
      raise exception 'The source location is fixed when a Transit is created';
    end if;
    v_to_location_id := (p_payload->>'to_location_id')::uuid;
    if v_to_location_id is null or v_to_location_id = v_from_location_id then
      raise exception 'Choose a destination different from the source location';
    end if;
    if nullif(btrim(p_payload->>'sender'), '') is null
       or nullif(btrim(p_payload->>'carrier'), '') is null then
      raise exception 'Sender and carrier are required';
    end if;
    if exists (select 1 from unnest(p_item_ids) x group by x having count(*) > 1) then
      raise exception 'Duplicate items were submitted';
    end if;

    perform i.id from public.items i
     where i.id = any(p_item_ids) order by i.id for update;
    if (select count(*) from public.items i where i.id = any(p_item_ids))
       <> (select count(distinct x) from unnest(p_item_ids) x) then
      raise exception 'One or more selected items do not exist';
    end if;
    if exists (
      select 1 from public.items i where i.id = any(p_item_ids)
       and i.current_location_id is distinct from v_from_location_id
    ) then raise exception 'Every selected item must currently be at the Transit source location'; end if;
    if exists (
      select 1 from public.machine_components mc
       where mc.component_item_id = any(p_item_ids)
         and not (mc.machine_item_id = any(p_item_ids))
    ) then raise exception 'An installed component can only transit with its parent Machine'; end if;
    if exists (
      select 1 from public.machine_components mc
       where mc.machine_item_id = any(p_item_ids)
         and not (mc.component_item_id = any(p_item_ids))
    ) then raise exception 'All installed components must be included when their parent Machine transits'; end if;
    if exists (
      select 1 from public.transit_items ti
      join public.transits t on t.id = ti.transit_id
      where ti.item_id = any(p_item_ids)
        and ti.transit_id <> v_transit_id
        and t.transit_progress in ('stand-by', 'moving')
    ) then raise exception 'One or more selected items already belong to another active Transit'; end if;

    -- Keep source location fixed. Remove deselected Machines first because
    -- the existing child-removal guard may require the parent transit row gone
    -- before its installed-component transit rows can be removed.
    delete from public.transit_items ti
     using public.items i
     where ti.transit_id = v_transit_id
       and i.id = ti.item_id
       and i.item_type = 'Machine'
       and not (ti.item_id = any(p_item_ids));

    delete from public.transit_items ti
     where ti.transit_id = v_transit_id
       and not (ti.item_id = any(p_item_ids));
    update public.transits set
      to_location_id = v_to_location_id,
      sender = nullif(btrim(p_payload->>'sender'), ''),
      receiver = nullif(btrim(p_payload->>'receiver'), ''),
      carrier = nullif(btrim(p_payload->>'carrier'), ''),
      note = nullif(btrim(p_payload->>'note'), '')
     where id = v_transit_id;
    foreach v_item_id in array p_item_ids loop
      insert into public.transit_items (transit_id, item_id)
      values (v_transit_id, v_item_id)
      on conflict (transit_id, item_id) do nothing;
    end loop;
    return v_transit_id;
  end if;

  if p_operation = 'start_transit' then
    if v_progress <> 'stand-by' then raise exception 'Only a stand-by Transit can start moving'; end if;
    v_sent_at := coalesce(nullif(p_payload->>'sent_at', '')::timestamptz, now());
    perform i.id
      from public.items i join public.transit_items ti on ti.item_id = i.id
     where ti.transit_id = v_transit_id order by i.id for update of i;
    if not exists (select 1 from public.transit_items where transit_id = v_transit_id) then
      raise exception 'A Transit must contain at least one item';
    end if;
    if exists (
      select 1 from public.transit_items ti join public.items i on i.id = ti.item_id
       where ti.transit_id = v_transit_id
         and i.current_location_id is distinct from v_from_location_id
    ) then raise exception 'Every Transit item must still be at the source location'; end if;
    update public.transits set transit_progress = 'moving', sent_at = v_sent_at, received_at = null
     where id = v_transit_id;
    return v_transit_id;
  end if;

  if p_operation = 'complete_transit' then
    if v_progress <> 'moving' then raise exception 'Only a moving Transit can be completed'; end if;
    v_received_at := nullif(p_payload->>'received_at', '')::timestamptz;
    if nullif(btrim(p_payload->>'receiver'), '') is null or v_received_at is null then
      raise exception 'Receiver and received date/time are required before completing a Transit';
    end if;
    if v_sent_at is null or v_received_at < v_sent_at then
      raise exception 'Received date/time cannot be earlier than sent date/time';
    end if;

    perform i.id
      from public.items i join public.transit_items ti on ti.item_id = i.id
     where ti.transit_id = v_transit_id order by i.id for update of i;
    if not exists (select 1 from public.transit_items where transit_id = v_transit_id) then
      raise exception 'A Transit must contain at least one item';
    end if;
    if exists (
      select 1 from public.transit_items ti join public.items i on i.id = ti.item_id
       where ti.transit_id = v_transit_id
         and i.current_location_id is distinct from v_from_location_id
    ) then raise exception 'Every Transit item must still be at the source location'; end if;

    update public.transits set
      sender = coalesce(nullif(btrim(p_payload->>'sender'), ''), sender),
      receiver = nullif(btrim(p_payload->>'receiver'), ''),
      carrier = coalesce(nullif(btrim(p_payload->>'carrier'), ''), carrier),
      received_at = v_received_at,
      note = coalesce(nullif(btrim(p_payload->>'note'), ''), note),
      transit_progress = 'completed'
     where id = v_transit_id;
    update public.transit_items set received_at = v_received_at
     where transit_id = v_transit_id;
    update public.items set current_location_id = v_to_location_id
     where id in (select item_id from public.transit_items where transit_id = v_transit_id);
    return v_transit_id;
  end if;

  raise exception 'Unsupported atomic inventory operation: %', p_operation using errcode = '22023';
end;
$$;

revoke all on function public.atomic_inventory_transit_operation(text, uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.atomic_inventory_transit_operation(text, uuid, jsonb, uuid[]) to authenticated;

commit;
