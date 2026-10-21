-- Allow Transits whose source and destination are the same location.
-- The application and atomic RPC both validate this, and the table has a
-- CHECK constraint that previously prohibited it. Keep all other RPC logic
-- unchanged by editing only the two location-comparison validations in the
-- installed function definition.

BEGIN;

ALTER TABLE public.transits
  DROP CONSTRAINT IF EXISTS transits_different_locations;

DO $migration$
DECLARE
  v_definition text;
  v_original text;
BEGIN
  v_definition := pg_get_functiondef(
    'public.atomic_inventory_transit_operation(text, uuid, jsonb, uuid[])'::regprocedure
  );
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    $old$
        IF v_from_location_id = v_to_location_id THEN
            RAISE EXCEPTION
                'From and To locations must be different';
        END IF;
$old$,
    ''
  );

  v_definition := replace(
    v_definition,
    $old$
        IF v_to_location_id IS NULL
           OR v_to_location_id = v_from_location_id THEN
            RAISE EXCEPTION
                'Choose a destination different from the source location';
        END IF;
$old$,
    $new$
        IF v_to_location_id IS NULL THEN
            RAISE EXCEPTION
                'Choose a destination location';
        END IF;
$new$
  );

  IF v_definition = v_original
     OR position('v_from_location_id = v_to_location_id' IN v_definition) > 0
     OR position('v_to_location_id = v_from_location_id' IN v_definition) > 0
  THEN
    RAISE EXCEPTION
      'Could not safely update atomic_inventory_transit_operation: expected location validations were not found';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

COMMIT;
