-- Asia Medicorp IMS
-- Rename generic inventory Status terminology to Inventory Status.
-- Incremental migration. DO NOT run inventory-redesign.sql.
--
-- Existing inventory-status records and UUIDs are preserved.

begin;

alter table public.statuses rename to inventory_statuses;

alter table public.items
  rename column status_id to inventory_status_id;

alter table public.items
  drop constraint if exists items_status_id_fkey;

alter table public.items
  add constraint items_inventory_status_id_fkey
  foreign key (inventory_status_id)
  references public.inventory_statuses(id);

commit;
