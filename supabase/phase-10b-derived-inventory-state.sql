-- Asia Medicorp IMS
-- Phase 10B — Derived "In Machine (machine SN)" inventory state.
--
-- Installed components retain their base inventory status (normally Idle).
-- machine_components is the authoritative installation relationship.
--
-- Do not run supabase/machine-components.sql after this migration. That file
-- contains the retired architecture that stores "In Machine" in items.

BEGIN;

-- Retire the legacy triggers that stored "In Machine" on items.
-- These objects are safe to drop here because installation truth is now
-- machine_components and the derived view below.
DROP TRIGGER IF EXISTS machine_components_after_insert ON public.machine_components;
DROP TRIGGER IF EXISTS machine_components_after_delete ON public.machine_components;
DROP TRIGGER IF EXISTS items_prevent_invalid_installed_status ON public.items;

DROP FUNCTION IF EXISTS public.machine_components_set_in_machine();
DROP FUNCTION IF EXISTS public.machine_components_set_idle();
DROP FUNCTION IF EXISTS public.prevent_invalid_installed_component_status();

DO $
DECLARE
  v_in_machine_status_id uuid;
  v_idle_status_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_in_machine_status_id
    FROM public.inventory_statuses
   WHERE name = 'In Machine'
   ORDER BY id
   LIMIT 1;

  IF v_in_machine_status_id IS NULL THEN
    RAISE NOTICE 'No "In Machine" inventory status exists. Continuing.';
    RETURN;
  END IF;

  SELECT id INTO v_idle_status_id
    FROM public.inventory_statuses
   WHERE name = 'Idle'
     AND is_active = true
   ORDER BY id
   LIMIT 1;

  IF v_idle_status_id IS NULL THEN
    RAISE EXCEPTION 'Phase 10B cannot continue: active "Idle" inventory status was not found.';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.items
   WHERE inventory_status_id = v_in_machine_status_id;

  IF v_count > 0 THEN
    RAISE NOTICE 'Migrating % legacy "In Machine" item(s) to "Idle".', v_count;

    UPDATE public.items
       SET inventory_status_id = v_idle_status_id,
           updated_at = now()
     WHERE inventory_status_id = v_in_machine_status_id;
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.get_item_inventory_state(uuid);
DROP VIEW IF EXISTS public.item_inventory_state;

CREATE VIEW public.item_inventory_state
WITH (security_invoker = true)
AS
SELECT
  i.id AS item_id,
  i.serial_number,
  i.item_type,
  i.inventory_status_id AS base_inventory_status_id,
  s.name AS base_inventory_status,
  mc.machine_item_id,
  machine.serial_number AS machine_serial_number,
  CASE
    WHEN mc.machine_item_id IS NOT NULL THEN
      'In Machine (' || COALESCE(machine.serial_number, 'Unknown') || ')'
    ELSE
      s.name
  END AS inventory_state
FROM public.items i
LEFT JOIN public.inventory_statuses s
  ON s.id = i.inventory_status_id
LEFT JOIN public.machine_components mc
  ON mc.component_item_id = i.id
LEFT JOIN public.items machine
  ON machine.id = mc.machine_item_id;

CREATE OR REPLACE FUNCTION public.get_item_inventory_state(p_item_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT inventory_state
    FROM public.item_inventory_state
   WHERE item_id = p_item_id;
$function$;

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.items i
    JOIN public.inventory_statuses s
      ON s.id = i.inventory_status_id
   WHERE s.name = 'In Machine';

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION
      'Phase 10B migration failed: % item(s) still reference "In Machine".',
      v_remaining;
  END IF;
END
$$;

DELETE FROM public.inventory_statuses
 WHERE name = 'In Machine';

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*) INTO v_remaining
    FROM public.inventory_statuses
   WHERE name = 'In Machine';

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION
      'Phase 10B failed: legacy "In Machine" master status still exists.';
  END IF;
END
$$;

GRANT SELECT ON public.item_inventory_state TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_item_inventory_state(uuid) TO authenticated;

COMMIT;
