-- Asia Medicorp IMS
-- Probe Models now belong to a Probe Type.
-- This is an incremental migration. DO NOT run inventory-redesign.sql for this change.

begin;

alter table public.probe_models
  add column if not exists probe_type_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.probe_models'::regclass
      and conname = 'probe_models_probe_type_id_fkey'
  ) then
    alter table public.probe_models
      add constraint probe_models_probe_type_id_fkey
      foreign key (probe_type_id)
      references public.probe_types(id);
  end if;
end $$;

alter table public.probe_models
  drop constraint if exists probe_models_name_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.probe_models'::regclass
      and contype = 'u'
      and conname = 'probe_models_probe_type_name_key'
  ) then
    alter table public.probe_models
      add constraint probe_models_probe_type_name_key
      unique (probe_type_id, name);
  end if;
end $$;

commit;

-- IMPORTANT:
-- Existing Probe Model rows may currently have probe_type_id = NULL.
-- The new UI requires a Probe Type for every NEW Probe Model.
-- Before making the database column mandatory, assign a Probe Type to each
-- existing row with the UPDATE statements below.
--
-- First inspect the existing rows:
-- select pm.id, pm.name, pm.probe_type_id
-- from public.probe_models pm
-- order by pm.name;
--
-- Then assign each existing model, for example:
-- update public.probe_models
-- set probe_type_id = '<PROBE_TYPE_UUID>'
-- where id = '<PROBE_MODEL_UUID>';
--
-- After every existing row has a probe_type_id, enforce the database-level
-- requirement with:
--
-- alter table public.probe_models
--   alter column probe_type_id set not null;
