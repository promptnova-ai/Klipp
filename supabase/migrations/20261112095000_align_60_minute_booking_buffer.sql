-- Apply the 60-minute travel buffer once per booking pair, not twice.
-- Existing booking/request windows are expanded; the candidate booking stays actual.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.find_auto_candidates(uuid,integer)'::regprocedure);
  v_old := 'e.scheduled_start - interval ''60 minutes'',';
  v_new := 'e.scheduled_start,';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate automatic candidate start buffer';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'e.scheduled_start + make_interval(mins => e.service_minutes) + interval ''60 minutes'',';
  v_new := 'e.scheduled_start + make_interval(mins => e.service_minutes),';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate automatic candidate end buffer';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.is_booking_reassignment_candidate(uuid,uuid,uuid)'::regprocedure);
  v_old := 'b.scheduled_start - interval ''60 minutes'',';
  v_new := 'b.scheduled_start,';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate reassignment candidate start buffer';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'b.scheduled_start + make_interval(mins => b.replacement_minutes) + interval ''60 minutes'',';
  v_new := 'b.scheduled_start + make_interval(mins => b.replacement_minutes),';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate reassignment candidate end buffer';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  v_definition := pg_get_functiondef('public.respond_to_request_unchecked(uuid,boolean)'::regprocedure);
  v_old := 'v_booking.scheduled_start - interval ''60 minutes'',';
  v_new := 'v_booking.scheduled_start,';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate acceptance reassignment start buffer';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'v_booking.scheduled_start + make_interval(mins => v_minutes) + interval ''60 minutes'',';
  v_new := 'v_booking.scheduled_start + make_interval(mins => v_minutes),';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate acceptance reassignment end buffer';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
