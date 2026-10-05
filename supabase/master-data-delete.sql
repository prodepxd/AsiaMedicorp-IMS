-- Asia Medicorp IMS
-- Safe master-data deletion support.
-- Run this once in Supabase SQL Editor.

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

  for fk in
    select
      c.oid,
      n.nspname as child_schema,
      child.relname as child_table,
      child_col.attname as child_column,
      parent_col.attname as parent_column
    from pg_constraint c
    join pg_class child on child.oid = c.conrelid
    join pg_namespace n on n.oid = child.relnamespace
    join pg_class parent on parent.oid = c.confrelid
    join pg_attribute child_col
      on child_col.attrelid = c.conrelid
     and child_col.attnum = c.conkey[1]
    join pg_attribute parent_col
      on parent_col.attrelid = c.confrelid
     and parent_col.attnum = c.confkey[1]
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

  return usage_count;
end;
$fn$;

revoke all on function public.master_record_usage(text, uuid) from public;
grant execute on function public.master_record_usage(text, uuid) to authenticated;
