-- Asia Medicorp IMS
-- Safe master-data deletion support.
-- Run this entire script in Supabase SQL Editor whenever this function is updated.

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
    'item_types',
    'manufacturers',
    'models',
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

  -- models are also referenced by items through the composite
  -- (model_id, manufacturer_id) -> models(id, manufacturer_id) FK.
  -- The generic loop above intentionally excludes composite FKs, so
  -- count item.model_id explicitly to prevent an in-use model from
  -- appearing deletable.
  if p_table_name = 'models' then
    select count(*)
      into ref_count
      from public.items
     where model_id = p_record_id;

    usage_count := usage_count + coalesce(ref_count, 0);
  end if;

  return usage_count;
end;
$fn$;

revoke all on function public.master_record_usage(text, uuid) from public;
grant execute on function public.master_record_usage(text, uuid) to authenticated;
