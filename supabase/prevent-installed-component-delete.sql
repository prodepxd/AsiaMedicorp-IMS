-- Asia Medicorp IMS
-- Prevent deletion of inventory items currently installed in a machine.
-- Incremental migration. DO NOT run inventory-redesign.sql.

begin;

create or replace function public.prevent_installed_component_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.machine_components
    where component_item_id = old.id
  ) then
    raise exception 'This item is currently installed in a machine and cannot be deleted. Remove it from the machine first.';
  end if;

  return old;
end;
$$;

drop trigger if exists items_prevent_installed_component_delete on public.items;

create trigger items_prevent_installed_component_delete
before delete on public.items
for each row
execute function public.prevent_installed_component_item_delete();

revoke all on function public.prevent_installed_component_item_delete() from public;
grant execute on function public.prevent_installed_component_item_delete() to authenticated;

commit;
