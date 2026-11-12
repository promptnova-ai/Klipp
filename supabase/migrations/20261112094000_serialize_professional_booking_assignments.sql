-- Serialize all operations that reserve or accept a professional's time.
-- The same advisory key is already used by manual booking creation.
CREATE OR REPLACE FUNCTION public.find_auto_candidates(
  p_booking_id uuid,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(pro_id uuid, distance_m double precision, rating_avg numeric)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  WITH b AS (
    SELECT id, scheduled_start, est_minutes, service_type_id, pricing_tier_id,
      extensions.st_setsrid(extensions.st_makepoint(client_lng, client_lat), 4326)::extensions.geography AS point
    FROM public.bookings
    WHERE id = p_booking_id
      AND assignment_mode = 'auto'
      AND status = 'requested'
      AND pro_id IS NULL
      AND scheduled_start > clock_timestamp() - interval '10 minutes'
      AND client_lat IS NOT NULL
      AND client_lng IS NOT NULL
  ),
  eligible AS (
    SELECT
      b.id AS booking_id,
      b.scheduled_start,
      b.service_type_id,
      b.pricing_tier_id,
      b.point,
      pp.user_id,
      pp.rating_avg,
      pp.jobs_completed,
      pp.service_area_latitude,
      pp.service_area_longitude,
      pp.service_area_radius_m,
      pr.latitude AS pro_latitude,
      pr.longitude AS pro_longitude,
      coalesce(tp.est_minutes, b.est_minutes) AS service_minutes
    FROM b
    JOIN public.pro_profiles pp ON pp.active
    JOIN public.pro_presence pr ON pr.pro_id = pp.user_id
    JOIN public.pro_services ps
      ON ps.pro_id = pp.user_id
     AND ps.service_type_id = b.service_type_id
     AND ps.active
    LEFT JOIN public.pro_service_tier_prices tp
      ON tp.pro_service_id = ps.id
     AND tp.pricing_tier_id = b.pricing_tier_id
     AND tp.active
    WHERE pp.verification_status = 'approved'
      AND pp.accepts_auto_assign
      AND pp.equipment_policy_accepted_at IS NOT NULL
      AND pp.service_area_latitude IS NOT NULL
      AND pp.service_area_longitude IS NOT NULL
      AND pp.service_area_radius_m IS NOT NULL
      AND pr.is_online
      AND pr.last_seen_at >= clock_timestamp() - interval '90 seconds'
      AND (b.pricing_tier_id IS NULL OR (tp.price_dop IS NOT NULL AND tp.est_minutes IS NOT NULL))
      AND extensions.st_dwithin(
        extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326)::extensions.geography,
        b.point,
        pp.service_area_radius_m
      )
  )
  SELECT e.user_id,
    extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(e.pro_longitude, e.pro_latitude), 4326)::extensions.geography,
      e.point
    ),
    e.rating_avg
  FROM eligible e
  WHERE (e.scheduled_start AT TIME ZONE 'America/Santo_Domingo')::date
      = ((e.scheduled_start + make_interval(mins => e.service_minutes)) AT TIME ZONE 'America/Santo_Domingo')::date
    AND EXISTS (
      SELECT 1 FROM public.pro_availability av
      WHERE av.pro_id = e.user_id
        AND av.weekday = extract(isodow from (e.scheduled_start at time zone 'America/Santo_Domingo'))::smallint
        AND av.start_time <= (e.scheduled_start at time zone 'America/Santo_Domingo')::time
        AND av.end_time >= ((e.scheduled_start + make_interval(mins => e.service_minutes)) at time zone 'America/Santo_Domingo')::time
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings ob
      WHERE ob.pro_id = e.user_id
        AND ob.status IN ('awaiting_payment','scheduled','en_route','arrived','in_progress')
        AND tstzrange(
          ob.scheduled_start - interval '60 minutes',
          ob.scheduled_start + make_interval(mins => ob.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(
          e.scheduled_start - interval '60 minutes',
          e.scheduled_start + make_interval(mins => e.service_minutes) + interval '60 minutes',
          '[)'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests previous_offer
      WHERE previous_offer.booking_id = e.booking_id
        AND previous_offer.pro_id = e.user_id
    )
    -- A pending offer only blocks another booking when their service windows overlap.
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_requests pending_offer
      JOIN public.bookings pending_booking ON pending_booking.id = pending_offer.booking_id
      WHERE pending_offer.pro_id = e.user_id
        AND pending_offer.status = 'pending'
        AND pending_offer.expires_at > clock_timestamp()
        AND pending_booking.status = 'requested'
        AND tstzrange(
          pending_booking.scheduled_start - interval '60 minutes',
          pending_booking.scheduled_start + make_interval(mins => pending_booking.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(
          e.scheduled_start - interval '60 minutes',
          e.scheduled_start + make_interval(mins => e.service_minutes) + interval '60 minutes',
          '[)'
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.booking_reassignment_requests pending_reassignment
      JOIN public.bookings reassignment_booking ON reassignment_booking.id = pending_reassignment.booking_id
      WHERE pending_reassignment.replacement_pro_id = e.user_id
        AND pending_reassignment.status = 'pending'
        AND pending_reassignment.expires_at > clock_timestamp()
        AND tstzrange(
          reassignment_booking.scheduled_start - interval '60 minutes',
          reassignment_booking.scheduled_start + make_interval(mins => reassignment_booking.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(
          e.scheduled_start - interval '60 minutes',
          e.scheduled_start + make_interval(mins => e.service_minutes) + interval '60 minutes',
          '[)'
        )
    )
  ORDER BY 2, e.rating_avg DESC, e.jobs_completed DESC
  LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_auto_booking(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_booking public.bookings%rowtype;
  v_created integer := 0;
  v_candidate record;
  v_locked_pro_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_admin_permission('bookings.manage') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('klipp_auto_dispatch'),
    hashtext(p_booking_id::text)
  );

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.assignment_mode <> 'auto'
     OR v_booking.status <> 'requested'
     OR v_booking.pro_id IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF v_booking.scheduled_start <= clock_timestamp() - interval '10 minutes' THEN
    UPDATE public.booking_requests
    SET status = 'expired',
        responded_at = coalesce(responded_at, clock_timestamp()),
        missed_at = coalesce(missed_at, clock_timestamp())
    WHERE booking_id = p_booking_id
      AND status = 'pending';

    UPDATE public.bookings
    SET status = 'expired'
    WHERE id = p_booking_id
      AND status = 'requested'
      AND pro_id IS NULL;
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_requests
    WHERE booking_id = p_booking_id
      AND status = 'pending'
      AND expires_at > clock_timestamp()
  ) THEN
    RETURN 0;
  END IF;

  -- Acquire the same per-professional lock used by manual booking creation.
  -- Sorting by UUID gives every concurrent dispatcher the same lock order.
  FOR v_candidate IN
    SELECT candidate.pro_id
    FROM public.find_auto_candidates(p_booking_id, 20) candidate
    ORDER BY candidate.pro_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('klipp_booking_pro'),
      hashtext(v_candidate.pro_id::text)
    );
    v_locked_pro_ids := array_append(v_locked_pro_ids, v_candidate.pro_id);
  END LOOP;

  -- Recheck the booking clock after any lock wait.
  IF v_booking.scheduled_start <= clock_timestamp() - interval '10 minutes' THEN
    UPDATE public.booking_requests
    SET status = 'expired',
        responded_at = coalesce(responded_at, clock_timestamp()),
        missed_at = coalesce(missed_at, clock_timestamp())
    WHERE booking_id = p_booking_id
      AND status = 'pending';

    UPDATE public.bookings
    SET status = 'expired'
    WHERE id = p_booking_id
      AND status = 'requested'
      AND pro_id IS NULL;
    RETURN 0;
  END IF;

  -- Re-run eligibility after the locks; only use professionals whose locks we hold.
  INSERT INTO public.booking_requests (booking_id, pro_id, expires_at)
  SELECT p_booking_id, candidate.pro_id, clock_timestamp() + interval '45 seconds'
  FROM public.find_auto_candidates(p_booking_id, 5) candidate
  WHERE candidate.pro_id = ANY(v_locked_pro_ids)
  ON CONFLICT (booking_id, pro_id) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_next_auto_booking_round_on_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_booking public.bookings%rowtype;
  v_candidate record;
  v_locked_pro_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF old.status IS NOT DISTINCT FROM new.status
     OR new.status NOT IN ('rejected'::public.request_status, 'expired'::public.request_status) THEN
    RETURN new;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('klipp_auto_dispatch'),
    hashtext(new.booking_id::text)
  );

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = new.booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_booking.assignment_mode <> 'auto'
     OR v_booking.status <> 'requested'
     OR v_booking.pro_id IS NOT NULL THEN
    RETURN new;
  END IF;

  IF v_booking.scheduled_start <= clock_timestamp() - interval '10 minutes' THEN
    UPDATE public.bookings
    SET status = 'expired'
    WHERE id = new.booking_id
      AND status = 'requested'
      AND pro_id IS NULL;
    RETURN new;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_requests
    WHERE booking_id = new.booking_id
      AND status = 'pending'
      AND expires_at > clock_timestamp()
  ) THEN
    RETURN new;
  END IF;

  FOR v_candidate IN
    SELECT candidate.pro_id
    FROM public.find_auto_candidates(new.booking_id, 20) candidate
    ORDER BY candidate.pro_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('klipp_booking_pro'),
      hashtext(v_candidate.pro_id::text)
    );
    v_locked_pro_ids := array_append(v_locked_pro_ids, v_candidate.pro_id);
  END LOOP;

  IF v_booking.scheduled_start <= clock_timestamp() - interval '10 minutes' THEN
    UPDATE public.bookings
    SET status = 'expired'
    WHERE id = new.booking_id
      AND status = 'requested'
      AND pro_id IS NULL;
    RETURN new;
  END IF;

  INSERT INTO public.booking_requests (booking_id, pro_id, expires_at)
  SELECT new.booking_id, candidate.pro_id, clock_timestamp() + interval '45 seconds'
  FROM public.find_auto_candidates(new.booking_id, 5) candidate
  WHERE candidate.pro_id = ANY(v_locked_pro_ids)
  ON CONFLICT (booking_id, pro_id) DO NOTHING;

  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_to_request_unchecked(
  p_request_id uuid,
  p_accept boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_req public.booking_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_pro_service public.pro_services%rowtype;
  v_price numeric(10,2);
  v_minutes integer;
  v_commission_pct numeric(5,2);
  v_commission numeric(10,2);
BEGIN
  SELECT * INTO v_req
  FROM public.booking_requests
  WHERE id = p_request_id
    AND pro_id = auth.uid()
    AND status = 'pending'
    AND expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'request not found or expired'; END IF;

  IF NOT p_accept THEN
    UPDATE public.booking_requests
    SET status = 'rejected', responded_at = clock_timestamp()
    WHERE id = v_req.id;
    RETURN;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_req.booking_id
    AND status = 'requested'
    AND (pro_id IS NULL OR pro_id = v_req.pro_id)
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking no longer available'; END IF;

  -- Serialize acceptance with manual creation, auto dispatch and reassignment.
  PERFORM pg_advisory_xact_lock(
    hashtext('klipp_booking_pro'),
    hashtext(v_req.pro_id::text)
  );

  IF v_req.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'request not found or expired';
  END IF;
  IF v_booking.scheduled_start <= clock_timestamp() - interval '10 minutes' THEN
    RAISE EXCEPTION 'booking has expired because its scheduled start time passed';
  END IF;

  SELECT * INTO v_pro_service
  FROM public.pro_services
  WHERE pro_id = v_req.pro_id
    AND service_type_id = v_booking.service_type_id
    AND active
  LIMIT 1;

  IF NOT FOUND THEN RAISE EXCEPTION 'professional service is no longer available'; END IF;

  IF v_booking.pricing_tier_id IS NOT NULL THEN
    SELECT price_dop, est_minutes
    INTO v_price, v_minutes
    FROM public.pro_service_tier_prices
    WHERE pro_service_id = v_pro_service.id
      AND pricing_tier_id = v_booking.pricing_tier_id
      AND active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'professional has not configured a price for this service variant';
    END IF;
  ELSE
    v_price := v_pro_service.base_price_dop;
    v_minutes := v_pro_service.est_minutes;
  END IF;

  IF v_price IS NULL OR v_price <= 0 OR v_minutes IS NULL OR v_minutes <= 0 THEN
    RAISE EXCEPTION 'professional tariff is invalid';
  END IF;

  IF (v_booking.scheduled_start AT TIME ZONE 'America/Santo_Domingo')::date
     <> ((v_booking.scheduled_start + make_interval(mins => v_minutes)) AT TIME ZONE 'America/Santo_Domingo')::date THEN
    RAISE EXCEPTION 'professional service does not fit within the scheduled local day';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings other_booking
    WHERE other_booking.pro_id = v_req.pro_id
      AND other_booking.id <> v_booking.id
      AND other_booking.status IN ('awaiting_payment','scheduled','en_route','arrived','in_progress')
      AND tstzrange(
        other_booking.scheduled_start - interval '60 minutes',
        other_booking.scheduled_start + make_interval(mins => other_booking.est_minutes) + interval '60 minutes',
        '[)'
      ) && tstzrange(
        v_booking.scheduled_start,
        v_booking.scheduled_start + make_interval(mins => v_minutes),
        '[)'
      )
  ) THEN
    RAISE EXCEPTION 'professional already has a booking in this time window';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_reassignment_requests reassignment
    JOIN public.bookings reassignment_booking ON reassignment_booking.id = reassignment.booking_id
    WHERE reassignment.replacement_pro_id = v_req.pro_id
      AND reassignment.status = 'pending'
      AND reassignment.expires_at > clock_timestamp()
      AND tstzrange(
        reassignment_booking.scheduled_start - interval '60 minutes',
        reassignment_booking.scheduled_start + make_interval(mins => reassignment_booking.est_minutes) + interval '60 minutes',
        '[)'
      ) && tstzrange(
        v_booking.scheduled_start - interval '60 minutes',
        v_booking.scheduled_start + make_interval(mins => v_minutes) + interval '60 minutes',
        '[)'
      )
  ) THEN
    RAISE EXCEPTION 'professional has a pending reassignment in this time window';
  END IF;

  SELECT coalesce((value #>> '{}')::numeric, 7.00)
  INTO v_commission_pct
  FROM public.platform_settings
  WHERE key = 'commission_pct';
  v_commission_pct := coalesce(v_commission_pct, 7.00);
  v_commission := round(v_price * v_commission_pct / 100, 2);

  UPDATE public.bookings
  SET pro_id = v_req.pro_id,
      pro_service_id = v_pro_service.id,
      est_minutes = v_minutes,
      price_dop = v_price,
      commission_pct = v_commission_pct,
      commission_dop = v_commission,
      pro_payout_dop = v_price - v_commission,
      status = 'awaiting_payment',
      accepted_at = clock_timestamp()
  WHERE id = v_booking.id
    AND status = 'requested'
    AND (pro_id IS NULL OR pro_id = v_req.pro_id);

  IF NOT FOUND THEN RAISE EXCEPTION 'booking no longer available'; END IF;

  UPDATE public.booking_requests
  SET status = 'accepted', responded_at = clock_timestamp()
  WHERE id = v_req.id;

  UPDATE public.booking_requests
  SET status = 'expired', responded_at = clock_timestamp()
  WHERE booking_id = v_req.booking_id
    AND id <> v_req.id
    AND status = 'pending';
END;
$function$;

-- Reassignment acceptance must take the same per-professional lock and recheck expiry.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.pro_respond_booking_reassignment(uuid,boolean)'::regprocedure);
  v_old := E'  IF p_accept THEN\n    IF NOT public.is_booking_reassignment_candidate';
  v_new := E'  IF p_accept THEN\n    PERFORM pg_advisory_xact_lock(hashtext(''klipp_booking_pro''), hashtext(auth.uid()::text));\n    IF v_request.expires_at <= clock_timestamp() OR v_booking.scheduled_start <= clock_timestamp() THEN\n      RAISE EXCEPTION ''reassignment request expired or booking time passed'';\n    END IF;\n    IF NOT public.is_booking_reassignment_candidate';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate reassignment acceptance lock insertion point';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- Pending reassignment requests on another day must not block this candidate.
  v_definition := pg_get_functiondef('public.is_booking_reassignment_candidate(uuid,uuid,uuid)'::regprocedure);
  v_old := E'      AND NOT EXISTS (\n        SELECT 1\n        FROM public.booking_reassignment_requests pending_request\n        WHERE pending_request.replacement_pro_id = pp.user_id\n          AND pending_request.status = ''pending''\n          AND pending_request.expires_at > now()\n          AND pending_request.id IS DISTINCT FROM p_ignore_request_id\n      )';
  v_new := E'      AND NOT EXISTS (\n        SELECT 1\n        FROM public.booking_reassignment_requests pending_request\n        JOIN public.bookings pending_booking ON pending_booking.id = pending_request.booking_id\n        WHERE pending_request.replacement_pro_id = pp.user_id\n          AND pending_request.status = ''pending''\n          AND pending_request.expires_at > now()\n          AND pending_request.id IS DISTINCT FROM p_ignore_request_id\n          AND tstzrange(\n            pending_booking.scheduled_start - interval ''60 minutes'',\n            pending_booking.scheduled_start + make_interval(mins => pending_booking.est_minutes) + interval ''60 minutes'',\n            ''[)''\n          ) && tstzrange(\n            b.scheduled_start - interval ''60 minutes'',\n            b.scheduled_start + make_interval(mins => b.replacement_minutes) + interval ''60 minutes'',\n            ''[)''\n          )\n      )';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate pending reassignment candidate filter';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;

-- Do not create a booking whose scheduled start passed while the RPC waited on locks.
CREATE OR REPLACE FUNCTION public.enforce_booking_creation_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_service_active boolean;
  v_end_local timestamp without time zone;
BEGIN
  SELECT service.active
  INTO v_service_active
  FROM public.service_types service
  WHERE service.id = NEW.service_type_id;

  IF NOT FOUND OR v_service_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'service is no longer available';
  END IF;

  IF NEW.scheduled_start IS NULL OR NEW.est_minutes IS NULL OR NEW.est_minutes <= 0 THEN
    RAISE EXCEPTION 'booking start and a positive service duration are required';
  END IF;

  IF NEW.scheduled_start <= clock_timestamp() THEN
    RAISE EXCEPTION 'booking start must be in the future';
  END IF;

  v_end_local := (NEW.scheduled_start + make_interval(mins => NEW.est_minutes))
    AT TIME ZONE 'America/Santo_Domingo';

  IF (NEW.scheduled_start AT TIME ZONE 'America/Santo_Domingo')::date <> v_end_local::date THEN
    RAISE EXCEPTION 'service must fit within one local calendar day';
  END IF;

  RETURN NEW;
END;
$function$;
