-- Phase 12: atomic transit operations.
-- Run this script manually in the Supabase SQL editor after reviewing it.
-- It intentionally does not modify or replace any existing migration script.

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
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'Insufficient privileges for inventory operation' using errcode = '42501';
  end if;

  if p_operation not in ('create_transit', 'edit_transit', 'complete_transit') then
    raise exception 'Unsupported atomic inventory operation: %', p_operation using errcode = '22023';
  end if;

  if p_operation = 'create_transit' then
    if coalesce(array_length(p_item_ids, 1), 0) = 0 then
      raise exception 'Select at least one item for the Transit';
    end if;

    insert into public.transits (
      from_location_id, to_location_id, sender, receiver, carrier,
      sent_at, received_at, note, transit_progress, created_by
    ) values (
      (p_payload->>'from_location_id')::uuid,
      (p_payload->>'to_location_id')::uuid,
      nullif(btrim(p_payload->>'sender'), ''),
      nullif(btrim(p_payload->>'receiver'), ''),
      nullif(btrim(p_payload->>'carrier'), ''),
      nullif(p_payload->>'sent_at', '')::timestamptz,
      nullif(p_payload->>'received_at', '')::timestamptz,
      nullif(btrim(p_payload->>'note'), ''),
      'stand-by',
      auth.uid()
    ) returning id into v_transit_id;

    foreach v_item_id in array p_item_ids loop
      insert into public.transit_items (transit_id, item_id)
      values (v_transit_id, v_item_id)
      on conflict (transit_id, item_id) do nothing;
    end loop;

  elsif p_operation = 'edit_transit' then
    if v_transit_id is null then raise exception 'Transit ID is required'; end if;
    if coalesce(array_length(p_item_ids, 1), 0) = 0 then
      raise exception 'Select at least one item for the Transit';
    end if;

    select transit_progress into v_progress
    from public.transits where id = v_transit_id for update;
    if not found then raise exception 'Transit not found'; end if;
    if v_progress = 'completed' then raise exception 'Completed transits cannot be edited'; end if;

    update public.transits set
      from_location_id = (p_payload->>'from_location_id')::uuid,
      to_location_id = (p_payload->>'to_location_id')::uuid,
      sender = nullif(btrim(p_payload->>'sender'), ''),
      receiver = nullif(btrim(p_payload->>'receiver'), ''),
      carrier = nullif(btrim(p_payload->>'carrier'), ''),
      sent_at = nullif(p_payload->>'sent_at', '')::timestamptz,
      received_at = nullif(p_payload->>'received_at', '')::timestamptz,
      note = nullif(btrim(p_payload->>'note'), '')
    where id = v_transit_id;

    -- Delete parent machines first; the existing guard then permits their
    -- auto-included installed components to be removed from this transit.
    delete from public.transit_items ti
    where ti.transit_id = v_transit_id
      and not (ti.item_id = any(p_item_ids))
      and not exists (
        select 1 from public.machine_components mc
        where mc.component_item_id = ti.item_id
          and mc.machine_item_id = any(p_item_ids)
      );

    delete from public.transit_items ti
    where ti.transit_id = v_transit_id
      and not (ti.item_id = any(p_item_ids));

    foreach v_item_id in array p_item_ids loop
      insert into public.transit_items (transit_id, item_id)
      values (v_transit_id, v_item_id)
      on conflict (transit_id, item_id) do nothing;
    end loop;

  else
    if v_transit_id is null then raise exception 'Transit ID is required'; end if;

    select transit_progress, from_location_id, to_location_id
      into v_progress, v_from_location_id, v_to_location_id
    from public.transits where id = v_transit_id for update;
    if not found then raise exception 'Transit not found'; end if;
    if v_progress = 'completed' then raise exception 'Transit is already completed'; end if;

    if nullif(btrim(p_payload->>'receiver'), '') is null
       or nullif(p_payload->>'received_at', '') is null then
      raise exception 'Receiver and received date/time are required before completing a Transit';
    end if;

    -- Lock all item rows in a stable order to serialize conflicting movements.
    perform i.id
    from public.items i
    join public.transit_items ti on ti.item_id = i.id
    where ti.transit_id = v_transit_id
    order by i.id
    for update of i;

    update public.transits set
      sender = coalesce(nullif(btrim(p_payload->>'sender'), ''), sender),
      receiver = nullif(btrim(p_payload->>'receiver'), ''),
      carrier = coalesce(nullif(btrim(p_payload->>'carrier'), ''), carrier),
      sent_at = coalesce(nullif(p_payload->>'sent_at', '')::timestamptz, sent_at),
      received_at = (p_payload->>'received_at')::timestamptz,
      note = nullif(btrim(p_payload->>'note'), ''),
      transit_progress = 'completed'
    where id = v_transit_id;

    update public.transit_items
    set received_at = (p_payload->>'received_at')::timestamptz
    where transit_id = v_transit_id;

    update public.items i
    set current_location_id = v_to_location_id
    where i.id in (
      select ti.item_id from public.transit_items ti where ti.transit_id = v_transit_id
    );
  end if;

  return v_transit_id;
end;
$$;

revoke all on function public.atomic_inventory_transit_operation(text, uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.atomic_inventory_transit_operation(text, uuid, jsonb, uuid[]) to authenticated;

commit;
