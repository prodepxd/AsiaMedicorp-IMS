-- Asia Medicorp IMS
-- Safe incremental migration for Probe Model -> compatible Machine Model assignments.
-- Existing Probe Models are preserved and are NOT required to have assignments immediately.
-- New Probe Models require at least 1 compatible Machine Model in the UI.
-- Maximum 8 compatible Machine Models are allowed per Probe Model.

begin;

create table if not exists public.probe_model_machine_models (
  id uuid primary key default gen_random_uuid(),
  probe_model_id uuid not null references public.probe_models(id) on delete restrict,
  machine_model_id uuid not null references public.machine_models(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint probe_model_machine_models_unique unique (probe_model_id, machine_model_id)
);

create index if not exists probe_model_machine_models_probe_model_idx
  on public.probe_model_machine_models(probe_model_id);

create index if not exists probe_model_machine_models_machine_model_idx
  on public.probe_model_machine_models(machine_model_id);

alter table public.probe_model_machine_models enable row level security;

drop policy if exists "probe_model_machine_models_select_authenticated"
  on public.probe_model_machine_models;
create policy "probe_model_machine_models_select_authenticated"
  on public.probe_model_machine_models
  for select
  to authenticated
  using (true);

drop policy if exists "probe_model_machine_models_insert_admin"
  on public.probe_model_machine_models;
create policy "probe_model_machine_models_insert_admin"
  on public.probe_model_machine_models
  for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

drop policy if exists "probe_model_machine_models_update_admin"
  on public.probe_model_machine_models;
create policy "probe_model_machine_models_update_admin"
  on public.probe_model_machine_models
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists "probe_model_machine_models_delete_admin"
  on public.probe_model_machine_models;
create policy "probe_model_machine_models_delete_admin"
  on public.probe_model_machine_models
  for delete
  to authenticated
  using (public.current_user_role() = 'admin');

grant select, insert, update, delete
  on public.probe_model_machine_models
  to authenticated;

create or replace function public.validate_probe_model_machine_model_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  active_value boolean;
  assignment_count integer;
begin
  select is_active
    into active_value
    from public.machine_models
   where id = new.machine_model_id;

  if active_value is distinct from true then
    raise exception 'Only active Machine Models can be newly assigned to a Probe Model.'
      using errcode = '23514';
  end if;

  select count(*)
    into assignment_count
    from public.probe_model_machine_models
   where probe_model_id = new.probe_model_id
     and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if assignment_count >= 8 then
    raise exception 'A Probe Model can support a maximum of 8 Machine Models.'
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

drop trigger if exists validate_probe_model_machine_model_assignment
  on public.probe_model_machine_models;

create trigger validate_probe_model_machine_model_assignment
before insert or update on public.probe_model_machine_models
for each row
execute function public.validate_probe_model_machine_model_assignment();

revoke all on function public.validate_probe_model_machine_model_assignment() from public;
grant execute on function public.validate_probe_model_machine_model_assignment() to authenticated;

commit;
