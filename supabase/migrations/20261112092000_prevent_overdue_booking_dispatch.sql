-- Never dispatch or accept a booking after its scheduled service window has materially passed.
-- A ten-minute grace period is retained for real-world arrival/start tolerance.
DO $migration$
DECLARE
  v_definition text;
  v_original text;
  v_replacement text;
BEGIN
  -- Candidate discovery is the final shared gate for every automatic dispatch round.
  v_definition := pg_get_functiondef('public.find_auto_candidates(uuid,integer)'::regprocedure);
  v_original := E'AND pro_id IS NULL\n      AND client_lat IS NOT NULL';
  v_replacement := E'AND pro_id IS NULL\n      AND scheduled_start > now() - interval ''10 minutes''\n      AND client_lat IS NOT NULL';
  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate the candidate-dispatch time guard insertion point';
  END IF;
  EXECUTE replace(v_definition, v_original, v_replacement);

  -- The service-role dispatch RPC must expire overdue bookings even if called directly.
  v_definition := pg_get_functiondef('public.dispatch_auto_booking(uuid)'::regprocedure);
  v_original := 'IF NOT FOUND THEN RAISE EXCEPTION ''booking not found''; END IF;';
  v_replacement := v_original || E'
  IF v_booking.scheduled_start <= now() - interval ''10 minutes'' THEN
    UPDATE public.booking_requests
    SET status = ''expired'',
        responded_at = coalesce(responded_at, now()),
        missed_at = coalesce(missed_at, now())
    WHERE booking_id = p_booking_id
      AND status = ''pending'';

    UPDATE public.bookings
    SET status = ''expired''
    WHERE id = p_booking_id
      AND status = ''requested''
      AND pro_id IS NULL;
    RETURN 0;
  END IF;';
  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate dispatch_auto_booking guard insertion point';
  END IF;
  EXECUTE replace(v_definition, v_original, v_replacement);

  -- Expiry/rejection triggers must not start another offer round for an overdue booking.
  v_definition := pg_get_functiondef('public.dispatch_next_auto_booking_round_on_response()'::regprocedure);
  v_original := E'  if not found\n     or v_booking.assignment_mode <> ''auto''\n     or v_booking.status <> ''requested''\n     or v_booking.pro_id is not null then\n    return new;\n  end if;';
  v_replacement := v_original || E'

  if v_booking.scheduled_start <= now() - interval ''10 minutes'' then
    update public.bookings
    set status = ''expired''
    where id = new.booking_id
      and status = ''requested''
      and pro_id is null;
    return new;
  end if;';
  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate next-round trigger guard insertion point';
  END IF;
  EXECUTE replace(v_definition, v_original, v_replacement);

  -- The scheduled worker expires both overdue manual requests and overdue auto offers.
  v_definition := pg_get_functiondef('public.process_scheduled_booking_dispatch()'::regprocedure);
  v_original := E'    select distinct booking_id\n    from public.booking_requests\n    where status = ''pending''\n      and expires_at <= now()';
  v_replacement := E'    select distinct r.booking_id\n    from public.booking_requests r\n    join public.bookings bk on bk.id = r.booking_id\n    where r.status = ''pending''\n      and (\n        r.expires_at <= now()\n        or (bk.status = ''requested'' and bk.scheduled_start <= now() - interval ''10 minutes'')\n      )';
  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate scheduled expiry selection';
  END IF;
  v_definition := replace(v_definition, v_original, v_replacement);

  v_original := E'    where booking_id = expired_booking.booking_id\n      and status = ''pending''\n      and expires_at <= now();';
  v_replacement := E'    where booking_id = expired_booking.booking_id\n      and status = ''pending''\n      and (\n        expires_at <= now()\n        or exists (\n          select 1 from public.bookings bk\n          where bk.id = expired_booking.booking_id\n            and bk.status = ''requested''\n            and bk.scheduled_start <= now() - interval ''10 minutes''\n        )\n      );';
  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate scheduled expiry update';
  END IF;
  v_definition := replace(v_definition, v_original, v_replacement);

  v_original := E'  for b in\n    select bk.id, bk.scheduled_start, near.distance_m';
  v_replacement := E'  update public.bookings bk\n  set status = ''expired''\n  where bk.status = ''requested''\n    and bk.scheduled_start <= now() - interval ''10 minutes''\n    and not exists (\n      select 1 from public.booking_requests r\n      where r.booking_id = bk.id\n        and r.status = ''pending''\n        and r.expires_at > now()\n    );\n\n  for b in\n    select bk.id, bk.scheduled_start, near.distance_m';
  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate scheduled dispatch loop';
  END IF;
  v_definition := replace(v_definition, v_original, v_replacement);

  v_original := E'      and bk.pro_id is null\n      and not exists (';
  v_replacement := E'      and bk.pro_id is null\n      and bk.scheduled_start > now() - interval ''10 minutes''\n      and not exists (';
  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate scheduled dispatch candidate filter';
  END IF;
  EXECUTE replace(v_definition, v_original, v_replacement);

  -- Even a still-live request cannot be accepted after its booking's grace period.
  v_definition := pg_get_functiondef('public.respond_to_request_unchecked(uuid,boolean)'::regprocedure);
  v_original := 'IF NOT FOUND THEN RAISE EXCEPTION ''booking no longer available''; END IF;';
  v_replacement := v_original || E'
  IF v_booking.scheduled_start <= now() - interval ''10 minutes'' THEN
    RAISE EXCEPTION ''booking has expired because its scheduled start time passed'';
  END IF;';
  IF position(v_original IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate booking acceptance guard';
  END IF;
  EXECUTE replace(v_definition, v_original, v_replacement);
END;
$migration$;
