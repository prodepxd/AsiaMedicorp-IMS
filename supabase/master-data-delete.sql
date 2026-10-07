-- Asia Medicorp IMS
-- Safe master-data deletion support for the current Asia Medicorp IMS schema.
-- Run this entire script in Supabase SQL Editor whenever this function is updated.
-- The function counts live foreign-key references from every current master category.

create or replace function public.master_record_usage(
  p_table_name text,
  p_record_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  fk record;
  usage_count integer := 0;
  ref_count integer := 0;
  sql text;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can check master-data usage';
  end if;

  if p_table_name not in (
    'equipment_manufacturers',
    'machine_models',
    'probe_types',
    'probe_models',
    'hard_disk_manufacturers',
    'board_types',
    'locations',
    'statuses',
    'quality_statuses',
    'transit_statuses',
    'suppliers',
    'customers'
  ) then
    raise exception 'Unsupported master-data table';
  end if;

  -- Count all normal single-column foreign-key references.
  for fk in
    select
      n.nspname as child_schema,
      child.relname as child_table,
      child_col.attname as child_column
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace n on n.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    join pg_attribute child_col
      on child_col.attrelid = c.conrelid
     and child_col.attnum = c.conkey[1]
    where c.contype = 'f'
      and parent.relname = p_table_name
      and array_length(c.conkey, 1) = 1
      and array_length(c.confkey, 1) = 1
      and n.nspname = 'public'
  loop
    sql := format(
      'select count(*) from %I.%I where %I = $1',
      fk.child_schema,
      fk.child_table,
      fk.child_column
    );

    execute sql into ref_count using p_record_id;
    usage_count := usage_count + coalesce(ref_count, 0);
  end loop;

  -- All current master-data relationships are single-column foreign keys,
  -- so the catalog-driven scan above covers the redesigned inventory schema.
  -- If a future composite FK is introduced, it must be added explicitly here.


  return usage_count;
end;
$fn$;

revoke all on function public.master_record_usage(text, uuid) from public;
grant execute on function public.master_record_usage(text, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- Inactive master-data reference guard
-- ---------------------------------------------------------------------------
-- Existing references are preserved. A new reference, or a changed reference,
-- must point to an active master record. This guard is attached automatically
-- to every current public single-column FK that points at a master category.

create or replace function public.prevent_inactive_master_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  fk record;
  new_value text;
  old_value text;
  active_value boolean;
  parent_exists boolean;
begin
  for fk in
    select
      parent.relname as parent_table,
      child_col.attname as child_column
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_class parent on parent.oid = c.confrelid
    join pg_attribute child_col
      on child_col.attrelid = c.conrelid
     and child_col.attnum = c.conkey[1]
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where c.contype = 'f'
      and c.conrelid = tg_relid
      and array_length(c.conkey, 1) = 1
      and array_length(c.confkey, 1) = 1
      and child_ns.nspname = 'public'
      and parent_ns.nspname = 'public'
      and parent.relname in (
        'equipment_manufacturers',
        'machine_models',
        'probe_types',
        'probe_models',
        'hard_disk_manufacturers',
        'board_types',
        'locations',
        'statuses',
        'quality_statuses',
        'transit_statuses',
        'suppliers',
        'customers'
      )
  loop
    new_value := to_jsonb(NEW) ->> fk.child_column;

    if new_value is null or btrim(new_value) = '' then
      continue;
    end if;

    -- An unchanged inactive reference is historical data and remains valid.
    if tg_op = 'UPDATE' then
      old_value := to_jsonb(OLD) ->> fk.child_column;
      if old_value is not distinct from new_value then
        continue;
      end if;
    end if;

    parent_exists := false;
    active_value := null;

    execute format(
      'select is_active from public.%I where id = $1::uuid',
      fk.parent_table
    )
    into active_value
    using new_value;

    if active_value is null then
      execute format(
        'select exists (select 1 from public.%I where id = $1::uuid)',
        fk.parent_table
      )
      into parent_exists
      using new_value;

      -- Let the normal FK constraint report a missing parent.
      if not parent_exists then
        continue;
      end if;
    end if;

    if active_value is false then
      raise exception 'Inactive master data cannot be used for a new reference: %.%',
        fk.parent_table, fk.child_column
        using errcode = '23514';
    end if;
  end loop;

  return NEW;
end;
$fn$;

revoke all on function public.prevent_inactive_master_reference() from public;
grant execute on function public.prevent_inactive_master_reference() to authenticated;

do $$
declare
  child record;
  trigger_name text := 'prevent_inactive_master_reference';
begin
  for child in
    select distinct
      child_ns.nspname as child_schema,
      child.relname as child_table
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_class parent on parent.oid = c.confrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and array_length(c.confkey, 1) = 1
      and child_ns.nspname = 'public'
      and parent_ns.nspname = 'public'
      and parent.relname in (
        'equipment_manufacturers',
        'machine_models',
        'probe_types',
        'probe_models',
        'hard_disk_manufacturers',
        'board_types',
        'locations',
        'statuses',
        'quality_statuses',
        'transit_statuses',
        'suppliers',
        'customers'
      )
  loop
    execute format(
      'drop trigger if exists %I on %I.%I',
      trigger_name,
      child.child_schema,
      child.child_table
    );

    execute format(
      'create trigger %I
       before insert or update on %I.%I
       for each row
       execute function public.prevent_inactive_master_reference()',
      trigger_name,
      child.child_schema,
      child.child_table
    );
  end loop;
end $$;
