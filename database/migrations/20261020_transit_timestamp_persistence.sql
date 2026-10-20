-- Transit timestamp persistence
-- Apply this migration to the Supabase project before using the updated UI.
-- It allows timestamp values to be recorded on stand-by transits, while retaining
-- the required sent timestamp for moving transits and both timestamps for completed
-- transits. The existing atomic_inventory_transit_operation remains unchanged.

CREATE OR REPLACE FUNCTION public.validate_transit_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.transit_progress IS DISTINCT FROM OLD.transit_progress
  THEN
    IF NOT (
      (OLD.transit_progress = 'stand-by' AND NEW.transit_progress = 'moving')
      OR (OLD.transit_progress = 'moving' AND NEW.transit_progress = 'completed')
    ) THEN
      RAISE EXCEPTION
        'Invalid Transit state transition: % -> %',
        OLD.transit_progress,
        NEW.transit_progress
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.sent_at IS NOT NULL
     AND NEW.received_at IS NOT NULL
     AND NEW.received_at < NEW.sent_at
  THEN
    RAISE EXCEPTION
      'Transit received_at cannot be earlier than sent_at.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.transit_progress = 'moving' THEN
    IF NEW.sent_at IS NULL THEN
      RAISE EXCEPTION
        'A moving Transit must have sent_at.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.received_at IS NOT NULL THEN
      RAISE EXCEPTION
        'A moving Transit cannot have received_at.'
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF NEW.transit_progress = 'completed' THEN
    IF NEW.sent_at IS NULL OR NEW.received_at IS NULL THEN
      RAISE EXCEPTION
        'A completed Transit must have both sent_at and received_at.'
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF NEW.transit_progress <> 'stand-by' THEN
    RAISE EXCEPTION
      'Invalid Transit progress value: %',
      NEW.transit_progress
      USING ERRCODE = 'check_violation';
  END IF;

  -- Stand-by transits may now retain manually entered sent/received timestamps.
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_transit_timestamps(
  p_transit_id uuid,
  p_sent_at timestamptz DEFAULT NULL,
  p_received_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_user_role();

  IF v_role IS NULL OR v_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION
      'Insufficient privileges for inventory operation'
      USING ERRCODE = '42501';
  END IF;

  IF p_transit_id IS NULL THEN
    RAISE EXCEPTION 'Transit ID is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_sent_at IS NOT NULL
     AND p_received_at IS NOT NULL
     AND p_received_at < p_sent_at
  THEN
    RAISE EXCEPTION
      'Received date/time cannot be earlier than sent date/time'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.transits
     SET sent_at = p_sent_at,
         received_at = p_received_at
   WHERE id = p_transit_id
     AND transit_progress = 'stand-by';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Only stand-by Transits can have timestamps edited here, or the Transit was not found';
  END IF;

  RETURN p_transit_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_transit_timestamps(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_transit_timestamps(uuid, timestamptz, timestamptz) TO authenticated;
