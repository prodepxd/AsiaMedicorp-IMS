-- Adds the create_past_transit operation to the existing atomic inventory RPC.
-- Run in Supabase SQL Editor against the target database after reviewing.
-- This replaces the existing function definition while preserving its existing operations.

CREATE OR REPLACE FUNCTION public.atomic_inventory_transit_operation(p_operation text, p_transit_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_item_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
    v_transit_id uuid := p_transit_id;
    v_item_id uuid;
    v_role text;
    v_progress text;
    v_from_location_id uuid;
    v_to_location_id uuid;
    v_sent_at timestamptz;
    v_received_at timestamptz;
    v_transit_item_id uuid;
BEGIN
    -- ========================================================
    -- 1. AUTHORIZATION
    --
    -- SECURITY DEFINER bypasses normal caller-level RLS
    -- enforcement for the function owner. Therefore every
    -- operation must be explicitly authorized here.
    -- ========================================================

    v_role := public.current_user_role();

    IF v_role IS NULL
       OR v_role NOT IN ('admin', 'manager') THEN
        RAISE EXCEPTION
            'Insufficient privileges for inventory operation'
            USING ERRCODE = '42501';
    END IF;

    IF p_operation IS NULL
       OR p_operation NOT IN (
            'create_transit',
            'create_past_transit',
            'edit_transit',
            'start_transit',
            'complete_transit',
            'delete_transit',
            'save_item_note'
       ) THEN
        RAISE EXCEPTION
            'Unsupported atomic inventory operation: %',
            p_operation
            USING ERRCODE = '22023';
    END IF;

    -- ========================================================
    -- 2. SAVE INDIVIDUAL ITEM TRANSIT-HISTORY NOTE
    -- ========================================================

    IF p_operation = 'save_item_note' THEN

        v_transit_item_id :=
            NULLIF(p_payload->>'transit_item_id', '')::uuid;

        IF v_transit_item_id IS NULL THEN
            RAISE EXCEPTION
                'Transit item history ID is required'
                USING ERRCODE = '22023';
        END IF;

        UPDATE public.transit_items
           SET note = NULLIF(
               BTRIM(p_payload->>'note'),
               ''
           )
         WHERE id = v_transit_item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Transit item history entry not found';
        END IF;

        RETURN COALESCE(
            p_transit_id,
            v_transit_item_id
        );
    END IF;

    -- ========================================================
    -- 3. DELETE TRANSIT
    -- Only admins may delete transit records.
    -- ========================================================

    IF p_operation = 'delete_transit' THEN

        IF v_role <> 'admin' THEN
            RAISE EXCEPTION
                'Only an admin can delete a Transit'
                USING ERRCODE = '42501';
        END IF;

        IF v_transit_id IS NULL THEN
            RAISE EXCEPTION 'Transit ID is required';
        END IF;

        SELECT t.transit_progress
          INTO v_progress
          FROM public.transits t
         WHERE t.id = v_transit_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Transit not found';
        END IF;

        DELETE FROM public.transits
         WHERE id = v_transit_id;

        RETURN v_transit_id;
    END IF;

    -- ========================================================
    -- CREATE A COMPLETED PAST TRANSIT
    -- ========================================================

    IF p_operation = 'create_past_transit' THEN

        IF COALESCE(CARDINALITY(p_item_ids), 0) = 0 THEN
            RAISE EXCEPTION 'Select at least one item for the past Transit';
        END IF;

        IF p_payload->>'from_location_id' IS NULL
           OR p_payload->>'to_location_id' IS NULL THEN
            RAISE EXCEPTION 'From and To locations are required';
        END IF;

        v_from_location_id := (p_payload->>'from_location_id')::uuid;
        v_to_location_id := (p_payload->>'to_location_id')::uuid;
        v_sent_at := NULLIF(p_payload->>'sent_at', '')::timestamptz;
        v_received_at := NULLIF(p_payload->>'received_at', '')::timestamptz;

        IF v_from_location_id = v_to_location_id THEN
            RAISE EXCEPTION 'From and To locations must be different';
        END IF;

        IF v_sent_at IS NULL OR v_received_at IS NULL THEN
            RAISE EXCEPTION 'Sent and received date/time are required for a past Transit';
        END IF;

        IF v_received_at < v_sent_at THEN
            RAISE EXCEPTION 'Received date/time cannot be earlier than sent date/time';
        END IF;

        IF NULLIF(BTRIM(p_payload->>'sender'), '') IS NULL
           OR NULLIF(BTRIM(p_payload->>'receiver'), '') IS NULL
           OR NULLIF(BTRIM(p_payload->>'carrier'), '') IS NULL THEN
            RAISE EXCEPTION 'Sender, receiver, and carrier are required for a past Transit';
        END IF;

        IF EXISTS (
            SELECT 1 FROM UNNEST(p_item_ids) AS x
            GROUP BY x HAVING COUNT(*) > 1
        ) THEN
            RAISE EXCEPTION 'Duplicate items were submitted';
        END IF;

        PERFORM i.id
          FROM public.items i
         WHERE i.id = ANY(p_item_ids)
         ORDER BY i.id
         FOR UPDATE;

        IF (
            SELECT COUNT(*) FROM public.items i WHERE i.id = ANY(p_item_ids)
        ) <> (
            SELECT COUNT(DISTINCT x) FROM UNNEST(p_item_ids) AS x
        ) THEN
            RAISE EXCEPTION 'One or more selected items do not exist';
        END IF;

        -- Historical records do not require the item's current location to match the recorded source.



        IF EXISTS (
            SELECT 1 FROM public.machine_components mc
             WHERE mc.component_item_id = ANY(p_item_ids)
               AND NOT (mc.machine_item_id = ANY(p_item_ids))
        ) THEN
            RAISE EXCEPTION 'An installed component can only transit with its parent Machine';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.machine_components mc
             WHERE mc.machine_item_id = ANY(p_item_ids)
               AND NOT (mc.component_item_id = ANY(p_item_ids))
        ) THEN
            RAISE EXCEPTION 'All installed components must be included when their parent Machine transits';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.transit_items ti
              JOIN public.transits t ON t.id = ti.transit_id
             WHERE ti.item_id = ANY(p_item_ids)
               AND t.transit_progress IN ('stand-by', 'moving')
        ) THEN
            RAISE EXCEPTION 'One or more selected items already belong to an active Transit';
        END IF;

        INSERT INTO public.transits (
            from_location_id, to_location_id, sender, receiver, carrier,
            sent_at, received_at, note, transit_progress, created_by
        )
        VALUES (
            v_from_location_id, v_to_location_id,
            NULLIF(BTRIM(p_payload->>'sender'), ''),
            NULLIF(BTRIM(p_payload->>'receiver'), ''),
            NULLIF(BTRIM(p_payload->>'carrier'), ''),
            v_sent_at, v_received_at,
            NULLIF(BTRIM(p_payload->>'note'), ''),
            'completed', auth.uid()
        )
        RETURNING id INTO v_transit_id;

        FOREACH v_item_id IN ARRAY p_item_ids LOOP
            INSERT INTO public.transit_items (transit_id, item_id, received_at)
            VALUES (v_transit_id, v_item_id, v_received_at);
        END LOOP;

        -- Do not rewrite current item locations when recording historical movement.
        -- The transit_items rows above add the movement to each item's history.


        RETURN v_transit_id;
    END IF;

    -- ========================================================
    -- 4. CREATE TRANSIT
    -- ========================================================

    IF p_operation = 'create_transit' THEN

        IF COALESCE(CARDINALITY(p_item_ids), 0) = 0 THEN
            RAISE EXCEPTION
                'Select at least one item for the Transit';
        END IF;

        IF p_payload->>'from_location_id' IS NULL
           OR p_payload->>'to_location_id' IS NULL THEN
            RAISE EXCEPTION
                'From and To locations are required';
        END IF;

        v_from_location_id :=
            (p_payload->>'from_location_id')::uuid;

        v_to_location_id :=
            (p_payload->>'to_location_id')::uuid;

        IF v_from_location_id = v_to_location_id THEN
            RAISE EXCEPTION
                'From and To locations must be different';
        END IF;

        IF NULLIF(BTRIM(p_payload->>'sender'), '') IS NULL
           OR NULLIF(BTRIM(p_payload->>'carrier'), '') IS NULL THEN
            RAISE EXCEPTION
                'Sender and carrier are required';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM UNNEST(p_item_ids) AS x
             GROUP BY x
            HAVING COUNT(*) > 1
        ) THEN
            RAISE EXCEPTION
                'Duplicate items were submitted';
        END IF;

        -- Lock selected items in a stable order.
        PERFORM i.id
          FROM public.items i
         WHERE i.id = ANY(p_item_ids)
         ORDER BY i.id
         FOR UPDATE;

        IF (
            SELECT COUNT(*)
              FROM public.items i
             WHERE i.id = ANY(p_item_ids)
        ) <> (
            SELECT COUNT(DISTINCT x)
              FROM UNNEST(p_item_ids) AS x
        ) THEN
            RAISE EXCEPTION
                'One or more selected items do not exist';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.items i
             WHERE i.id = ANY(p_item_ids)
               AND i.current_location_id
                   IS DISTINCT FROM v_from_location_id
        ) THEN
            RAISE EXCEPTION
                'Every selected item must currently be at the Transit source location';
        END IF;

        -- Installed components can only travel with their machine.
        IF EXISTS (
            SELECT 1
              FROM public.machine_components mc
             WHERE mc.component_item_id = ANY(p_item_ids)
               AND NOT (
                   mc.machine_item_id = ANY(p_item_ids)
               )
        ) THEN
            RAISE EXCEPTION
                'An installed component can only transit with its parent Machine';
        END IF;

        -- Every installed component must accompany a selected machine.
        IF EXISTS (
            SELECT 1
              FROM public.machine_components mc
             WHERE mc.machine_item_id = ANY(p_item_ids)
               AND NOT (
                   mc.component_item_id = ANY(p_item_ids)
               )
        ) THEN
            RAISE EXCEPTION
                'All installed components must be included when their parent Machine transits';
        END IF;

        -- Prevent concurrent active transits for the same item.
        IF EXISTS (
            SELECT 1
              FROM public.transit_items ti
              JOIN public.transits t
                ON t.id = ti.transit_id
             WHERE ti.item_id = ANY(p_item_ids)
               AND t.transit_progress IN ('stand-by', 'moving')
        ) THEN
            RAISE EXCEPTION
                'One or more selected items already belong to an active Transit';
        END IF;

        INSERT INTO public.transits (
            from_location_id,
            to_location_id,
            sender,
            receiver,
            carrier,
            sent_at,
            received_at,
            note,
            transit_progress,
            created_by
        )
        VALUES (
            v_from_location_id,
            v_to_location_id,
            NULLIF(BTRIM(p_payload->>'sender'), ''),
            NULLIF(BTRIM(p_payload->>'receiver'), ''),
            NULLIF(BTRIM(p_payload->>'carrier'), ''),
            NULL,
            NULL,
            NULLIF(BTRIM(p_payload->>'note'), ''),
            'stand-by',
            auth.uid()
        )
        RETURNING id INTO v_transit_id;

        FOREACH v_item_id IN ARRAY p_item_ids LOOP
            INSERT INTO public.transit_items (
                transit_id,
                item_id
            )
            VALUES (
                v_transit_id,
                v_item_id
            );
        END LOOP;

        RETURN v_transit_id;
    END IF;

    -- ========================================================
    -- 5. LOAD AND LOCK EXISTING TRANSIT
    -- ========================================================

    IF v_transit_id IS NULL THEN
        RAISE EXCEPTION 'Transit ID is required';
    END IF;

    SELECT
        t.transit_progress,
        t.from_location_id,
        t.to_location_id,
        t.sent_at
    INTO
        v_progress,
        v_from_location_id,
        v_to_location_id,
        v_sent_at
    FROM public.transits t
    WHERE t.id = v_transit_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transit not found';
    END IF;

    -- ========================================================
    -- 6. EDIT STAND-BY TRANSIT
    -- ========================================================

    IF p_operation = 'edit_transit' THEN

        IF v_progress <> 'stand-by' THEN
            RAISE EXCEPTION
                'Only stand-by Transits can be edited';
        END IF;

        IF COALESCE(CARDINALITY(p_item_ids), 0) = 0 THEN
            RAISE EXCEPTION
                'Select at least one item for the Transit';
        END IF;

        IF (p_payload->>'from_location_id')::uuid
           IS DISTINCT FROM v_from_location_id THEN
            RAISE EXCEPTION
                'The source location is fixed when a Transit is created';
        END IF;

        v_to_location_id :=
            (p_payload->>'to_location_id')::uuid;

        IF v_to_location_id IS NULL
           OR v_to_location_id = v_from_location_id THEN
            RAISE EXCEPTION
                'Choose a destination different from the source location';
        END IF;

        IF NULLIF(BTRIM(p_payload->>'sender'), '') IS NULL
           OR NULLIF(BTRIM(p_payload->>'carrier'), '') IS NULL THEN
            RAISE EXCEPTION
                'Sender and carrier are required';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM UNNEST(p_item_ids) AS x
             GROUP BY x
            HAVING COUNT(*) > 1
        ) THEN
            RAISE EXCEPTION
                'Duplicate items were submitted';
        END IF;

        PERFORM i.id
          FROM public.items i
         WHERE i.id = ANY(p_item_ids)
         ORDER BY i.id
         FOR UPDATE;

        IF (
            SELECT COUNT(*)
              FROM public.items i
             WHERE i.id = ANY(p_item_ids)
        ) <> (
            SELECT COUNT(DISTINCT x)
              FROM UNNEST(p_item_ids) AS x
        ) THEN
            RAISE EXCEPTION
                'One or more selected items do not exist';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.items i
             WHERE i.id = ANY(p_item_ids)
               AND i.current_location_id
                   IS DISTINCT FROM v_from_location_id
        ) THEN
            RAISE EXCEPTION
                'Every selected item must currently be at the Transit source location';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.machine_components mc
             WHERE mc.component_item_id = ANY(p_item_ids)
               AND NOT (
                   mc.machine_item_id = ANY(p_item_ids)
               )
        ) THEN
            RAISE EXCEPTION
                'An installed component can only transit with its parent Machine';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.machine_components mc
             WHERE mc.machine_item_id = ANY(p_item_ids)
               AND NOT (
                   mc.component_item_id = ANY(p_item_ids)
               )
        ) THEN
            RAISE EXCEPTION
                'All installed components must be included when their parent Machine transits';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.transit_items ti
              JOIN public.transits t
                ON t.id = ti.transit_id
             WHERE ti.item_id = ANY(p_item_ids)
               AND ti.transit_id <> v_transit_id
               AND t.transit_progress IN ('stand-by', 'moving')
        ) THEN
            RAISE EXCEPTION
                'One or more selected items already belong to another active Transit';
        END IF;

        -- Remove deselected machines first, then their remaining
        -- transit-item rows. All changes are in this transaction.
        DELETE FROM public.transit_items ti
        USING public.items i
        WHERE ti.transit_id = v_transit_id
          AND i.id = ti.item_id
          AND i.item_type = 'Machine'
          AND NOT (ti.item_id = ANY(p_item_ids));

        DELETE FROM public.transit_items ti
         WHERE ti.transit_id = v_transit_id
           AND NOT (ti.item_id = ANY(p_item_ids));

        UPDATE public.transits
           SET to_location_id = v_to_location_id,
               sender = NULLIF(BTRIM(p_payload->>'sender'), ''),
               receiver = NULLIF(BTRIM(p_payload->>'receiver'), ''),
               carrier = NULLIF(BTRIM(p_payload->>'carrier'), ''),
               note = NULLIF(BTRIM(p_payload->>'note'), '')
         WHERE id = v_transit_id;

        FOREACH v_item_id IN ARRAY p_item_ids LOOP
            INSERT INTO public.transit_items (
                transit_id,
                item_id
            )
            VALUES (
                v_transit_id,
                v_item_id
            )
            ON CONFLICT (transit_id, item_id) DO NOTHING;
        END LOOP;

        RETURN v_transit_id;
    END IF;

    -- ========================================================
    -- 7. START TRANSIT
    -- ========================================================

    IF p_operation = 'start_transit' THEN

        IF v_progress <> 'stand-by' THEN
            RAISE EXCEPTION
                'Only a stand-by Transit can start moving';
        END IF;

        v_sent_at := COALESCE(
            NULLIF(p_payload->>'sent_at', '')::timestamptz,
            NOW()
        );

        PERFORM i.id
          FROM public.items i
          JOIN public.transit_items ti
            ON ti.item_id = i.id
         WHERE ti.transit_id = v_transit_id
         ORDER BY i.id
         FOR UPDATE OF i;

        IF NOT EXISTS (
            SELECT 1
              FROM public.transit_items ti
             WHERE ti.transit_id = v_transit_id
        ) THEN
            RAISE EXCEPTION
                'A Transit must contain at least one item';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.transit_items ti
              JOIN public.items i
                ON i.id = ti.item_id
             WHERE ti.transit_id = v_transit_id
               AND i.current_location_id
                   IS DISTINCT FROM v_from_location_id
        ) THEN
            RAISE EXCEPTION
                'Every Transit item must still be at the source location';
        END IF;

        UPDATE public.transits
           SET transit_progress = 'moving',
               sent_at = v_sent_at,
               received_at = NULL
         WHERE id = v_transit_id;

        RETURN v_transit_id;
    END IF;

    -- ========================================================
    -- 8. COMPLETE TRANSIT
    -- ========================================================

    IF p_operation = 'complete_transit' THEN

        IF v_progress <> 'moving' THEN
            RAISE EXCEPTION
                'Only a moving Transit can be completed';
        END IF;

        v_received_at :=
            NULLIF(p_payload->>'received_at', '')::timestamptz;

        IF NULLIF(BTRIM(p_payload->>'receiver'), '') IS NULL
           OR v_received_at IS NULL THEN
            RAISE EXCEPTION
                'Receiver and received date/time are required before completing a Transit';
        END IF;

        IF v_sent_at IS NULL
           OR v_received_at < v_sent_at THEN
            RAISE EXCEPTION
                'Received date/time cannot be earlier than sent date/time';
        END IF;

        PERFORM i.id
          FROM public.items i
          JOIN public.transit_items ti
            ON ti.item_id = i.id
         WHERE ti.transit_id = v_transit_id
         ORDER BY i.id
         FOR UPDATE OF i;

        IF NOT EXISTS (
            SELECT 1
              FROM public.transit_items ti
             WHERE ti.transit_id = v_transit_id
        ) THEN
            RAISE EXCEPTION
                'A Transit must contain at least one item';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.transit_items ti
              JOIN public.items i
                ON i.id = ti.item_id
             WHERE ti.transit_id = v_transit_id
               AND i.current_location_id
                   IS DISTINCT FROM v_from_location_id
        ) THEN
            RAISE EXCEPTION
                'Every Transit item must still be at the source location';
        END IF;

        UPDATE public.transits
           SET sender = COALESCE(
                   NULLIF(BTRIM(p_payload->>'sender'), ''),
                   sender
               ),
               receiver = NULLIF(
                   BTRIM(p_payload->>'receiver'),
                   ''
               ),
               carrier = COALESCE(
                   NULLIF(BTRIM(p_payload->>'carrier'), ''),
                   carrier
               ),
               received_at = v_received_at,
               note = COALESCE(
                   NULLIF(BTRIM(p_payload->>'note'), ''),
                   note
               ),
               transit_progress = 'completed'
         WHERE id = v_transit_id;

        UPDATE public.transit_items
           SET received_at = v_received_at
         WHERE transit_id = v_transit_id;

        UPDATE public.items
           SET current_location_id = v_to_location_id
         WHERE id IN (
             SELECT ti.item_id
               FROM public.transit_items ti
              WHERE ti.transit_id = v_transit_id
         );

        RETURN v_transit_id;
    END IF;

    RAISE EXCEPTION
        'Unsupported atomic inventory operation: %',
        p_operation
        USING ERRCODE = '22023';
END;
$function$

