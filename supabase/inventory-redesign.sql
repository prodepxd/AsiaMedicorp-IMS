begin;

drop table if exists purchase_items cascade;
drop table if exists sale_items cascade;
drop table if exists shipment_items cascade;
drop table if exists item_photos cascade;
drop table if exists machine_details cascade;
drop table if exists probe_details cascade;
drop table if exists board_details cascade;
drop table if exists psu_details cascade;
drop table if exists monitor_details cascade;
drop table if exists emi_filter_details cascade;
drop table if exists hard_disk_details cascade;
drop table if exists keyboard_details cascade;
drop table if exists items cascade;
drop table if exists item_types cascade;
drop table if exists models cascade;
drop table if exists manufacturers cascade;

drop table if exists machine_models cascade;
drop table if exists probe_models cascade;
drop table if exists board_types cascade;
drop table if exists probe_types cascade;
drop table if exists hard_disk_manufacturers cascade;
drop table if exists equipment_manufacturers cascade;

create table equipment_manufacturers(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hard_disk_manufacturers(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table machine_models(
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references equipment_manufacturers(id) on delete restrict,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(manufacturer_id,name)
);

create table probe_types(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table probe_models(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table board_types(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table items(
  id uuid primary key default gen_random_uuid(),
  serial_number text,
  item_type text not null check(item_type in ('Machine','Probe','Board','PSU','Monitor','EMI Filter','Hard Disk','Keyboard')),
  status_id uuid not null references statuses(id),
  quality_status_id uuid not null references quality_statuses(id),
  quality_note text,
  current_location_id uuid references locations(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index items_serial_number_unique on items(lower(serial_number)) where serial_number is not null;

create table machine_details(
  item_id uuid primary key references items(id) on delete cascade,
  manufacturer_id uuid not null references equipment_manufacturers(id),
  model_id uuid not null references machine_models(id),
  manufacturer_year integer not null,
  monitor_size integer not null check(monitor_size in(15,17,19,21,23)),
  software_version text not null,
  functions text[] not null default '{}',
  portable boolean not null,
  connector_count integer not null check(connector_count between 1 and 5)
);

create table probe_details(
  item_id uuid primary key references items(id) on delete cascade,
  manufacturer_id uuid not null references equipment_manufacturers(id),
  model_id uuid not null references probe_models(id),
  probe_type_id uuid not null references probe_types(id),
  year integer
);

create table board_details(
  item_id uuid primary key references items(id) on delete cascade,
  compatible_machine_model_id uuid not null references machine_models(id),
  board_type_id uuid not null references board_types(id),
  part_number text not null,
  version_number text not null,
  repaired boolean not null
);

create table psu_details(
  item_id uuid primary key references items(id) on delete cascade,
  compatible_machine_model_id uuid not null references machine_models(id)
);

create table monitor_details(
  item_id uuid primary key references items(id) on delete cascade,
  compatible_machine_model_id uuid not null references machine_models(id),
  size integer not null check(size in(15,17,19,21,23)),
  video_input text not null check(video_input in('VGA','HDMI'))
);

create table emi_filter_details(
  item_id uuid primary key references items(id) on delete cascade,
  filter_type text not null check(filter_type in('Wired','Board'))
);

create table hard_disk_details(
  item_id uuid primary key references items(id) on delete cascade,
  manufacturer_id uuid not null references hard_disk_manufacturers(id),
  capacity_gb numeric not null check(capacity_gb>0),
  size_inches numeric not null check(size_inches>0),
  disk_type text not null check(disk_type in('IDE','SATA','SSD')),
  compatible_machine_model_id uuid references machine_models(id),
  software_version text
);

create table keyboard_details(
  item_id uuid primary key references items(id) on delete cascade,
  compatible_machine_model_id uuid not null references machine_models(id)
);

create index machine_details_manufacturer_idx on machine_details(manufacturer_id);
create index machine_details_model_idx on machine_details(model_id);
create index probe_details_manufacturer_idx on probe_details(manufacturer_id);
create index probe_details_model_idx on probe_details(model_id);
create index probe_details_type_idx on probe_details(probe_type_id);
create index board_details_machine_model_idx on board_details(compatible_machine_model_id);
create index board_details_type_idx on board_details(board_type_id);
create index psu_details_machine_model_idx on psu_details(compatible_machine_model_id);
create index monitor_details_machine_model_idx on monitor_details(compatible_machine_model_id);
create index hard_disk_details_manufacturer_idx on hard_disk_details(manufacturer_id);
create index hard_disk_details_machine_model_idx on hard_disk_details(compatible_machine_model_id);
create index keyboard_details_machine_model_idx on keyboard_details(compatible_machine_model_id);
create index items_type_idx on items(item_type);
create index items_status_idx on items(status_id);
create index items_quality_idx on items(quality_status_id);
create index items_location_idx on items(current_location_id);

create table purchase_items(
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  purchase_price numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table sale_items(
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  sale_price numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table shipment_items(
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  item_id uuid not null references items(id) on delete restrict,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  check(removed_at is null or removed_at>=added_at)
);

create unique index shipment_items_active_item_unique on shipment_items(item_id) where removed_at is null;
create index purchase_items_purchase_idx on purchase_items(purchase_id);
create index purchase_items_item_idx on purchase_items(item_id);
create index sale_items_sale_idx on sale_items(sale_id);
create index sale_items_item_idx on sale_items(item_id);
create index shipment_items_shipment_idx on shipment_items(shipment_id);
create index shipment_items_item_idx on shipment_items(item_id);

create table item_photos(
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index item_photos_item_idx on item_photos(item_id);

do $$
declare t text;
begin
  foreach t in array array[
    'equipment_manufacturers','hard_disk_manufacturers','machine_models',
    'probe_types','probe_models','board_types','items',
    'machine_details','probe_details','board_details','psu_details',
    'monitor_details','emi_filter_details','hard_disk_details','keyboard_details',
    'item_photos','purchase_items','sale_items','shipment_items'
  ] loop
    execute format('drop trigger if exists %I_updated_at on %I', t, t);
    if t not in ('machine_details','probe_details','board_details','psu_details','monitor_details','emi_filter_details','hard_disk_details','keyboard_details','purchase_items','sale_items','shipment_items') then
      execute format('create trigger %I_updated_at before update on %I for each row execute function public.set_updated_at()', t, t);
    end if;
  end loop;
end $$;

alter table items enable row level security;

create policy "items_read" on items for select to authenticated using(true);
create policy "items_insert" on items for insert to authenticated
  with check(public.current_user_role() in('admin','manager'));
create policy "items_update" on items for update to authenticated
  using(public.current_user_role() in('admin','manager'))
  with check(public.current_user_role() in('admin','manager'));
create policy "items_delete" on items for delete to authenticated
  using(public.current_user_role()='admin');

do $$
declare t text;
begin
  foreach t in array array[
    'machine_details','probe_details','board_details','psu_details',
    'monitor_details','emi_filter_details','hard_disk_details','keyboard_details'
  ] loop
    execute format('alter table %I enable row level security',t);
    execute format('create policy "%s_read" on %I for select to authenticated using(true)',t,t);
    execute format('create policy "%s_write" on %I for insert to authenticated with check(public.current_user_role() in (''admin'',''manager''))',t,t);
    execute format('create policy "%s_update" on %I for update to authenticated using(public.current_user_role() in (''admin'',''manager'')) with check(public.current_user_role() in (''admin'',''manager''))',t,t);
    execute format('create policy "%s_delete" on %I for delete to authenticated using(public.current_user_role()=''admin'')',t,t);
  end loop;

  foreach t in array array[
    'equipment_manufacturers','hard_disk_manufacturers','machine_models',
    'probe_types','probe_models','board_types'
  ] loop
    execute format('alter table %I enable row level security',t);
    execute format('create policy "%s_read" on %I for select to authenticated using(true)',t,t);
    execute format('create policy "%s_write" on %I for insert to authenticated with check(public.current_user_role()=''admin'')',t,t);
    execute format('create policy "%s_update" on %I for update to authenticated using(public.current_user_role()=''admin'') with check(public.current_user_role()=''admin'')',t,t);
    execute format('create policy "%s_delete" on %I for delete to authenticated using(public.current_user_role()=''admin'')',t,t);
  end loop;

  foreach t in array array['purchase_items','sale_items','shipment_items','item_photos'] loop
    execute format('alter table %I enable row level security',t);
    execute format('create policy "%s_read" on %I for select to authenticated using(true)',t,t);
    execute format('create policy "%s_insert" on %I for insert to authenticated with check(public.current_user_role() in (''admin'',''manager''))',t,t);
    execute format('create policy "%s_update" on %I for update to authenticated using(public.current_user_role() in (''admin'',''manager'')) with check(public.current_user_role() in (''admin'',''manager''))',t,t);
    execute format('create policy "%s_delete" on %I for delete to authenticated using(public.current_user_role()=''admin'')',t,t);
  end loop;
end $$;

commit;


-- Probe models are independent of manufacturer
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='probe_models' and column_name='manufacturer_id'
  ) then
    alter table public.probe_models drop constraint if exists probe_models_manufacturer_id_fkey;
    alter table public.probe_models drop column manufacturer_id;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.probe_models'::regclass
      and contype='u'
      and conname='probe_models_name_key'
  ) then
    alter table public.probe_models add constraint probe_models_name_key unique (name);
  end if;
end $$;
