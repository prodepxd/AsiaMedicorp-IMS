-- Asia Medicorp IMS
-- Add Equipment Manufacturer to Probe Models without changing existing rows.
-- This is an incremental migration. DO NOT run inventory-redesign.sql for this change.
--
-- IMPORTANT:
-- Existing Probe Model rows keep their current names and Probe Types.
-- manufacturer_id is intentionally nullable so existing rows are never
-- invalidated or forced into an arbitrary manufacturer.
--
-- After this migration, new/edited Probe Models in the UI require a
-- manufacturer. Existing rows can be assigned a manufacturer individually.

begin;

alter table public.probe_models
  add column if not exists manufacturer_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.probe_models'::regclass
      and conname = 'probe_models_manufacturer_id_fkey'
  ) then
    alter table public.probe_models
      add constraint probe_models_manufacturer_id_fkey
      foreign key (manufacturer_id)
      references public.equipment_manufacturers(id);
  end if;
end $$;

alter table public.probe_models
  drop constraint if exists probe_models_probe_type_name_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.probe_models'::regclass
      and contype = 'u'
      and conname = 'probe_models_probe_type_manufacturer_name_key'
  ) then
    alter table public.probe_models
      add constraint probe_models_probe_type_manufacturer_name_key
      unique (probe_type_id, manufacturer_id, name);
  end if;
end $$;

commit;
