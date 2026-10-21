-- Allow a Transit to use the same source and destination location.
-- Review and run this script against the Supabase database before deploying
-- the frontend change. It changes the existing RPC function without altering
-- its other authorization, item-validation, or transit-state behavior.

BEGIN;

DO $migration$
DECLARE
    v_definition text;
    v_updated_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'public.atomic_inventory_transit_operation(text, uuid, jsonb, uuid[])'::regprocedure
    )
    INTO v_definition;

    IF v_definition IS NULL THEN
        RAISE EXCEPTION 'Could not find atomic_inventory_transit_operation(text, uuid, jsonb, uuid[])';
    END IF;

    IF position($old_create$
        IF v_from_location_id = v_to_location_id THEN
            RAISE EXCEPTION
                'From and To locations must be different';
        END IF;
$old_create$ IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Expected create-transit location check was not found; migration aborted';
    END IF;

    IF position($old_edit$
        IF v_to_location_id IS NULL
           OR v_to_location_id = v_from_location_id THEN
            RAISE EXCEPTION
                'Choose a destination different from the source location';
        END IF;
$old_edit$ IN v_definition) = 0 THEN
        RAISE EXCEPTION 'Expected edit-transit location check was not found; migration aborted';
    END IF;

    v_updated_definition := replace(
        v_definition,
        $old_create$
        IF v_from_location_id = v_to_location_id THEN
            RAISE EXCEPTION
                'From and To locations must be different';
        END IF;
$old_create$,
        ''
    );

    v_updated_definition := replace(
        v_updated_definition,
        $old_edit$
        IF v_to_location_id IS NULL
           OR v_to_location_id = v_from_location_id THEN
            RAISE EXCEPTION
                'Choose a destination different from the source location';
        END IF;
$old_edit$,
        $new_edit$
        IF v_to_location_id IS NULL THEN
            RAISE EXCEPTION
                'To location is required';
        END IF;
$new_edit$
    );

    EXECUTE v_updated_definition;

    ALTER TABLE public.transits
        DROP CONSTRAINT IF EXISTS transits_different_locations;
END;
$migration$;

COMMIT;
