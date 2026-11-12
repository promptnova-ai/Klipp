-- A held payment is already financially committed and must block reassignment.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.admin_create_booking_reassignment(uuid,uuid,text)'::regprocedure);
  v_old := 'status IN (''pending'',''released'',''refunded'')';
  v_new := 'status IN (''pending'',''held'',''released'',''refunded'')';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate admin reassignment payment-state guard';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.admin_list_booking_reassignment_candidates(uuid)'::regprocedure);
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate reassignment candidate payment-state guard';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.pro_respond_booking_reassignment(uuid,boolean)'::regprocedure);
  v_old := 'status IN (''pending'', ''released'', ''refunded'')';
  v_new := 'status IN (''pending'', ''held'', ''released'', ''refunded'')';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate professional reassignment payment-state guard';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.is_booking_reassignment_candidate(uuid,uuid,uuid)'::regprocedure);
  v_old := 'AND b.scheduled_start > now()';
  v_new := v_old || E'
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments payment
        WHERE payment.booking_id = b.id
          AND payment.status IN (''pending'', ''held'', ''released'', ''refunded'')
      )';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate candidate-level payment-state guard';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
