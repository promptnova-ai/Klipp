-- Phase 3.1: audited dispatch of unassigned requests and safe cancellation.
-- The admin cannot override payment or in-progress service state. Reassignment
-- of an already accepted/paid booking is deliberately excluded until a
-- professional-acceptance + payment-transfer workflow is implemented.

CREATE OR REPLACE FUNCTION public.admin_list_booking_candidates(p_booking_id uuid)
RETURNS TABLE (
  pro_id uuid,
  professional_name text,
  rating_avg numeric,
  jobs_completed integer,
  distance_km numeric,
  is_online boolean,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_booking public.bookings%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('bookings.manage') THEN
    RAISE EXCEPTION 'permission denied: bookings.manage';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  ;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'requested' OR v_booking.pro_id IS NOT NULL THEN
    RAISE EXCEPTION 'only unassigned requests can receive an administrative dispatch';
  END IF;
  IF v_booking.client_lat IS NULL OR v_booking.client_lng IS NULL THEN
    RAISE EXCEPTION 'booking has no valid client coordinates';
  END IF;
  IF v_booking.scheduled_start <= now() THEN
    RAISE EXCEPTION 'booking start time has already passed';
  END IF;
  IF (v_booking.scheduled_start AT TIME ZONE 'America/Santo_Domingo')::date
     <> ((v_booking.scheduled_start + make_interval(mins => v_booking.est_minutes)) AT TIME ZONE 'America/Santo_Domingo')::date THEN
    RAISE EXCEPTION 'cross-midnight bookings are not eligible for manual dispatch';
  END IF;

  RETURN QUERY
  SELECT
    pp.user_id,
    profile.full_name,
    pp.rating_avg,
    pp.jobs_completed,
    round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(v_booking.client_lng, v_booking.client_lat),4326)::extensions.geography
    ) / 1000.0)::numeric, 1),
    coalesce(presence.is_online AND presence.last_seen_at >= now() - interval '90 seconds', false),
    presence.last_seen_at
  FROM public.pro_profiles pp
  JOIN public.profiles profile ON profile.id = pp.user_id
  LEFT JOIN public.pro_presence presence ON presence.pro_id = pp.user_id
  WHERE pp.active
    AND pp.verification_status = 'approved'
    AND pp.equipment_policy_accepted_at IS NOT NULL
    AND pp.service_area_latitude IS NOT NULL
    AND pp.service_area_longitude IS NOT NULL
    AND pp.service_area_radius_m IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.pro_services ps
      WHERE ps.pro_id = pp.user_id
        AND ps.service_type_id = v_booking.service_type_id
        AND ps.active
    )
    AND extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(v_booking.client_lng,v_booking.client_lat),4326)::extensions.geography,
      pp.service_area_radius_m
    )
    AND EXISTS (
      SELECT 1 FROM public.pro_availability av
      WHERE av.pro_id = pp.user_id
        AND av.weekday = extract(isodow from (v_booking.scheduled_start at time zone 'America/Santo_Domingo'))::smallint
        AND av.start_time <= (v_booking.scheduled_start at time zone 'America/Santo_Domingo')::time
        AND av.end_time >= ((v_booking.scheduled_start + make_interval(mins => v_booking.est_minutes)) at time zone 'America/Santo_Domingo')::time
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings other_booking
      WHERE other_booking.pro_id = pp.user_id
        AND other_booking.id <> v_booking.id
        AND other_booking.status IN ('awaiting_payment','scheduled','en_route','arrived','in_progress')
        AND tstzrange(
          other_booking.scheduled_start - interval '60 minutes',
          other_booking.scheduled_start + make_interval(mins => other_booking.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(
          v_booking.scheduled_start,
          v_booking.scheduled_start + make_interval(mins => v_booking.est_minutes),
          '[)'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests previous_request
      WHERE previous_request.booking_id = v_booking.id
        AND previous_request.pro_id = pp.user_id
    )
    AND (
      v_booking.scheduled_start > now() + interval '20 minutes'
      OR (
        presence.is_online
        AND presence.last_seen_at >= now() - interval '90 seconds'
        AND presence.latitude IS NOT NULL
        AND presence.longitude IS NOT NULL
      )
    )
  ORDER BY
    CASE WHEN presence.is_online AND presence.last_seen_at >= now() - interval '90 seconds' THEN 0 ELSE 1 END,
    extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(v_booking.client_lng,v_booking.client_lat),4326)::extensions.geography
    ),
    pp.rating_avg DESC NULLS LAST,
    pp.jobs_completed DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dispatch_booking_request(
  p_booking_id uuid,
  p_pro_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_request_id uuid;
  v_expiry_minutes integer := 120;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('bookings.manage') THEN
    RAISE EXCEPTION 'permission denied: bookings.manage';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 OR length(trim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'enter an operational reason between 5 and 500 characters';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'requested' OR v_booking.pro_id IS NOT NULL THEN
    RAISE EXCEPTION 'only unassigned requests can receive an administrative dispatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE booking_id = p_booking_id AND status IN ('held','released','refunded')
  ) THEN
    RAISE EXCEPTION 'booking has a payment that requires the payment workflow; administrative dispatch is blocked';
  END IF;

  -- Reuse the exact candidate rules shown to the administrator.
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_list_booking_candidates(p_booking_id) candidate
    WHERE candidate.pro_id = p_pro_id
  ) THEN
    RAISE EXCEPTION 'professional is no longer eligible or available for this booking';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_requests
    WHERE booking_id = p_booking_id AND pro_id = p_pro_id
  ) THEN
    RAISE EXCEPTION 'this professional has already received a request for this booking';
  END IF;

  SELECT coalesce((SELECT (value #>> '{}')::integer FROM public.platform_settings WHERE key = 'request_expiry_minutes'), 120)
    INTO v_expiry_minutes;

  UPDATE public.booking_requests
  SET status = 'expired', responded_at = coalesce(responded_at, now())
  WHERE booking_id = p_booking_id AND status = 'pending';

  INSERT INTO public.booking_requests(booking_id, pro_id, expires_at)
  VALUES (p_booking_id, p_pro_id, now() + make_interval(mins => least(greatest(v_expiry_minutes, 2), 120)))
  RETURNING id INTO v_request_id;

  INSERT INTO public.admin_audit_log(actor_id, action, target_id, details)
  VALUES (
    auth.uid(),
    'booking.manual_dispatch_requested',
    p_booking_id,
    jsonb_build_object(
      'professional_id', p_pro_id,
      'request_id', v_request_id,
      'reason', trim(p_reason),
      'expires_at', now() + make_interval(mins => least(greatest(v_expiry_minutes, 2), 120))
    )
  );

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_unassigned_booking(
  p_booking_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('bookings.manage') THEN
    RAISE EXCEPTION 'permission denied: bookings.manage';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 OR length(trim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'enter a cancellation reason between 5 and 500 characters';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'requested' OR v_booking.pro_id IS NOT NULL THEN
    RAISE EXCEPTION 'only unassigned requests can be cancelled from this control';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE booking_id = p_booking_id AND status IN ('held','released','refunded')
  ) THEN
    RAISE EXCEPTION 'booking has a payment that requires the payment/refund workflow; cancellation is blocked';
  END IF;

  UPDATE public.booking_requests
  SET status = 'expired', responded_at = coalesce(responded_at, now())
  WHERE booking_id = p_booking_id AND status = 'pending';

  UPDATE public.bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancel_reason = trim(p_reason)
  WHERE id = p_booking_id;

  INSERT INTO public.admin_audit_log(actor_id, action, target_id, details)
  VALUES (
    auth.uid(),
    'booking.unassigned_cancelled',
    p_booking_id,
    jsonb_build_object('previous_status', v_booking.status::text, 'reason', trim(p_reason))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_booking_candidates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_dispatch_booking_request(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_unassigned_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_booking_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dispatch_booking_request(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_unassigned_booking(uuid, text) TO authenticated;
