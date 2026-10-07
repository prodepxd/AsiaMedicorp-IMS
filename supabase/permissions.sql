-- Asia Medicorp IMS
-- Incremental permission hardening for the live database.
-- Role matrix:
--   admin  = full access, including deletes and master-data maintenance
--   manager = operational create/update, component install/remove, no deletes/master-data changes
--   viewer = read-only
-- DO NOT run inventory-redesign.sql for this change.

begin;

-- Ensure authenticated users have table privileges; RLS below remains the authority.
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Master data: read for everyone, write/delete for admins only.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'equipment_manufacturers',
    'hard_disk_manufacturers',
    'machine_models',
    'probe_types',
    'probe_models',
    'board_types',
    'locations',
    'statuses',
    'quality_statuses',
    'transit_statuses',
    'suppliers',
    'customers'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "ims_read" on public.%I', t);
    execute format('create policy "ims_read" on public.%I for select to authenticated using (true)', t);

    execute format('drop policy if exists "ims_admin_insert" on public.%I', t);
    execute format('create policy "ims_admin_insert" on public.%I for insert to authenticated with check (public.current_user_role() = ''admin'')', t);

    execute format('drop policy if exists "ims_admin_update" on public.%I', t);
    execute format('create policy "ims_admin_update" on public.%I for update to authenticated using (public.current_user_role() = ''admin'') with check (public.current_user_role() = ''admin'')', t);

    execute format('drop policy if exists "ims_admin_delete" on public.%I', t);
    execute format('create policy "ims_admin_delete" on public.%I for delete to authenticated using (public.current_user_role() = ''admin'')', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Inventory items and subtype records: read for everyone, create/update for
-- admin + manager, delete for admin only.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'items',
    'machine_details',
    'probe_details',
    'board_details',
    'psu_details',
    'monitor_details',
    'emi_filter_details',
    'hard_disk_details',
    'keyboard_details',
    'item_photos',
    'purchase_items',
    'sale_items',
    'shipment_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "ims_read" on public.%I', t);
    execute format('create policy "ims_read" on public.%I for select to authenticated using (true)', t);

    execute format('drop policy if exists "ims_manager_insert" on public.%I', t);
    execute format('create policy "ims_manager_insert" on public.%I for insert to authenticated with check (public.current_user_role() in (''admin'',''manager''))', t);

    execute format('drop policy if exists "ims_manager_update" on public.%I', t);
    execute format('create policy "ims_manager_update" on public.%I for update to authenticated using (public.current_user_role() in (''admin'',''manager'')) with check (public.current_user_role() in (''admin'',''manager''))', t);

    execute format('drop policy if exists "ims_admin_delete" on public.%I', t);
    execute format('create policy "ims_admin_delete" on public.%I for delete to authenticated using (public.current_user_role() = ''admin'')', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Machine/component relationships: admin + manager may install/remove
-- components. Viewers are read-only.
-- ---------------------------------------------------------------------------
alter table public.machine_components enable row level security;

drop policy if exists "machine_components_read" on public.machine_components;
create policy "machine_components_read"
on public.machine_components
for select to authenticated
using (true);

drop policy if exists "machine_components_insert" on public.machine_components;
create policy "machine_components_insert"
on public.machine_components
for insert to authenticated
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists "machine_components_delete" on public.machine_components;
create policy "machine_components_delete"
on public.machine_components
for delete to authenticated
using (public.current_user_role() in ('admin','manager'));

-- ---------------------------------------------------------------------------
-- Purchasing, sales, shipments and transit events use the same operational
-- permission model where these tables exist in the current schema.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['purchases','sales','shipments','transit_events'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);

      execute format('drop policy if exists "ims_read" on public.%I', t);
      execute format('create policy "ims_read" on public.%I for select to authenticated using (true)', t);

      execute format('drop policy if exists "ims_manager_insert" on public.%I', t);
      execute format('create policy "ims_manager_insert" on public.%I for insert to authenticated with check (public.current_user_role() in (''admin'',''manager''))', t);

      execute format('drop policy if exists "ims_manager_update" on public.%I', t);
      execute format('create policy "ims_manager_update" on public.%I for update to authenticated using (public.current_user_role() in (''admin'',''manager'')) with check (public.current_user_role() in (''admin'',''manager''))', t);

      execute format('drop policy if exists "ims_admin_delete" on public.%I', t);
      execute format('create policy "ims_admin_delete" on public.%I for delete to authenticated using (public.current_user_role() = ''admin'')', t);
    end if;
  end loop;
end $$;

-- Profiles: users may read their own profile; only admins may manage profiles.
alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles
for select to authenticated
using (public.current_user_role() = 'admin');

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles
for update to authenticated
using (public.current_user_role() = 'admin')
with check (role in ('admin','manager','viewer'));

revoke insert, delete on public.profiles from authenticated;

commit;
