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

create table equipment_manufacturers(id uuid primary key default gen_random_uuid(),name text not null unique,description text,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table hard_disk_manufacturers(id uuid primary key default gen_random_uuid(),name text not null unique,description text,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table machine_models(id uuid primary key default gen_random_uuid(),manufacturer_id uuid not null references equipment_manufacturers(id),name text not null,description text,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(manufacturer_id,name));
create table probe_types(id uuid primary key default gen_random_uuid(),name text not null unique,description text,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table probe_models(id uuid primary key default gen_random_uuid(),manufacturer_id uuid not null references equipment_manufacturers(id),name text not null,description text,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(manufacturer_id,name));
create table board_types(id uuid primary key default gen_random_uuid(),name text not null unique,description text,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());

create table items(id uuid primary key default gen_random_uuid(),serial_number text,item_type text not null check(item_type in ('Machine','Probe','Board','PSU','Monitor','EMI Filter','Hard Disk','Keyboard')),status_id uuid not null references statuses(id),quality_status_id uuid not null references quality_statuses(id),quality_note text,current_location_id uuid references locations(id) on delete set null,notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(serial_number));
create table machine_details(item_id uuid primary key references items(id) on delete cascade,manufacturer_id uuid not null references equipment_manufacturers(id),model_id uuid not null references machine_models(id),manufacturer_year integer not null,monitor_size integer not null check(monitor_size in(15,17,19,21,23)),software_version text not null,functions text[] not null default '{}',portable boolean not null,connector_count integer not null check(connector_count between 1 and 5));
create table probe_details(item_id uuid primary key references items(id) on delete cascade,manufacturer_id uuid not null references equipment_manufacturers(id),model_id uuid not null references probe_models(id),probe_type_id uuid not null references probe_types(id),year integer);
create table board_details(item_id uuid primary key references items(id) on delete cascade,compatible_machine_model_id uuid not null references machine_models(id),board_type_id uuid not null references board_types(id),part_number text not null,version_number text not null,repaired boolean not null);
create table psu_details(item_id uuid primary key references items(id) on delete cascade,compatible_machine_model_id uuid not null references machine_models(id));
create table monitor_details(item_id uuid primary key references items(id) on delete cascade,compatible_machine_model_id uuid not null references machine_models(id),size integer not null check(size in(15,17,19,21,23)),video_input text not null check(video_input in('VGA','HDMI')));
create table emi_filter_details(item_id uuid primary key references items(id) on delete cascade,filter_type text not null check(filter_type in('Wired','Board')));
create table hard_disk_details(item_id uuid primary key references items(id) on delete cascade,manufacturer_id uuid not null references hard_disk_manufacturers(id),capacity_gb numeric not null check(capacity_gb>0),size_inches numeric not null check(size_inches>0),disk_type text not null check(disk_type in('IDE','SATA','SSD')),compatible_machine_model_id uuid references machine_models(id),software_version text);
create table keyboard_details(item_id uuid primary key references items(id) on delete cascade,compatible_machine_model_id uuid not null references machine_models(id));

create table purchase_items(id uuid primary key default gen_random_uuid(),purchase_id uuid not null references purchases(id) on delete cascade,item_id uuid not null references items(id) on delete restrict,purchase_price numeric,notes text,created_at timestamptz not null default now());
create table sale_items(id uuid primary key default gen_random_uuid(),sale_id uuid not null references sales(id) on delete cascade,item_id uuid not null references items(id) on delete restrict,sale_price numeric,notes text,created_at timestamptz not null default now());
create table shipment_items(id uuid primary key default gen_random_uuid(),shipment_id uuid not null references shipments(id) on delete cascade,item_id uuid not null references items(id) on delete restrict,added_at timestamptz not null default now(),removed_at timestamptz,check(removed_at is null or removed_at>=added_at));
create unique index shipment_items_active_item_unique on shipment_items(item_id) where removed_at is null;
create table item_photos(id uuid primary key default gen_random_uuid(),item_id uuid not null references items(id) on delete cascade,storage_path text not null,caption text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());

alter table items enable row level security;
create policy "items_read" on items for select to authenticated using(true);
create policy "items_insert" on items for insert to authenticated with check(public.current_user_role() in('admin','manager'));
create policy "items_update" on items for update to authenticated using(public.current_user_role() in('admin','manager')) with check(public.current_user_role() in('admin','manager'));
create policy "items_delete" on items for delete to authenticated using(public.current_user_role()='admin');

do $$
declare t text;
begin
foreach t in array array['machine_details','probe_details','board_details','psu_details','monitor_details','emi_filter_details','hard_disk_details','keyboard_details'] loop
execute format('alter table %I enable row level security',t);
execute format('create policy "%s_read" on %I for select to authenticated using(true)',t,t);
execute format('create policy "%s_write" on %I for all to authenticated using(public.current_user_role() in (''admin'',''manager'')) with check(public.current_user_role() in (''admin'',''manager''))',t,t);
end loop;
foreach t in array array['equipment_manufacturers','hard_disk_manufacturers','machine_models','probe_types','probe_models','board_types'] loop
execute format('alter table %I enable row level security',t);
execute format('create policy "%s_read" on %I for select to authenticated using(true)',t,t);
execute format('create policy "%s_write" on %I for all to authenticated using(public.current_user_role()=''admin'') with check(public.current_user_role()=''admin'')',t,t);
end loop;
end $$;
commit;