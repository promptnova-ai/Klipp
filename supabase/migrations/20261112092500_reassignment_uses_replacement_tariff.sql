-- Reassignment must validate and apply the replacement professional's own service tariff.
CREATE OR REPLACE FUNCTION public.is_booking_reassignment_candidate(
  p_booking_id uuid,
  p_pro_id uuid,
  p_ignore_request_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH replacement AS (
    SELECT
      b.id,
      b.client_lat,
      b.client_lng,
      b.scheduled_start,
      b.service_type_id,
      b.pricing_tier_id,
      b.pro_id AS original_pro_id,
      b.status,
      ps.id AS replacement_pro_service_id,
      CASE WHEN b.pricing_tier_id IS NULL THEN ps.base_price_dop ELSE tp.price_dop END AS replacement_price_dop,
      CASE WHEN b.pricing_tier_id IS NULL THEN ps.est_minutes ELSE tp.est_minutes END AS replacement_minutes
    FROM public.bookings b
    JOIN public.pro_services ps
      ON ps.pro_id = p_pro_id
     AND ps.service_type_id = b.service_type_id
     AND ps.active
    LEFT JOIN public.pro_service_tier_prices tp
      ON tp.pro_service_id = ps.id
     AND tp.pricing_tier_id = b.pricing_tier_id
     AND tp.active
    WHERE b.id = p_booking_id
      AND (
        b.pricing_tier_id IS NULL
        OR (tp.price_dop IS NOT NULL AND tp.est_minutes IS NOT NULL)
      )
  )
  SELECT EXISTS (
    SELECT 1
    FROM replacement b
    JOIN public.pro_profiles pp ON pp.user_id = p_pro_id
    WHERE b.status = 'scheduled'
      AND b.original_pro_id IS NOT NULL
      AND b.scheduled_start > now()
      AND pp.user_id <> b.original_pro_id
      AND pp.active
      AND pp.verification_status = 'approved'
      AND b.replacement_price_dop > 0
      AND b.replacement_minutes > 0
      AND EXISTS (
        SELECT 1 FROM public.service_types service
        WHERE service.id = b.service_type_id AND service.active
      )
      AND (b.scheduled_start AT TIME ZONE 'America/Santo_Domingo')::date
        = ((b.scheduled_start + make_interval(mins => b.replacement_minutes)) AT TIME ZONE 'America/Santo_Domingo')::date
      AND pp.equipment_policy_accepted_at IS NOT NULL
      AND pp.service_area_latitude IS NOT NULL
      AND pp.service_area_longitude IS NOT NULL
      AND pp.service_area_radius_m IS NOT NULL
      AND b.client_lat IS NOT NULL
      AND b.client_lng IS NOT NULL
      AND extensions.st_dwithin(
        extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326)::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(b.client_lng, b.client_lat), 4326)::extensions.geography,
        pp.service_area_radius_m
      )
      AND EXISTS (
        SELECT 1
        FROM public.pro_availability av
        WHERE av.pro_id = pp.user_id
          AND av.weekday = extract(isodow from (b.scheduled_start AT TIME ZONE 'America/Santo_Domingo'))::smallint
          AND av.start_time <= (b.scheduled_start AT TIME ZONE 'America/Santo_Domingo')::time
          AND av.end_time >= ((b.scheduled_start + make_interval(mins => b.replacement_minutes)) AT TIME ZONE 'America/Santo_Domingo')::time
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_reassignment_requests pending_request
        WHERE pending_request.replacement_pro_id = pp.user_id
          AND pending_request.status = 'pending'
          AND pending_request.expires_at > now()
          AND pending_request.id IS DISTINCT FROM p_ignore_request_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.bookings other_booking
        WHERE other_booking.pro_id = pp.user_id
          AND other_booking.id <> b.id
          AND other_booking.status IN ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
          AND tstzrange(
            other_booking.scheduled_start - interval '60 minutes',
            other_booking.scheduled_start + make_interval(mins => other_booking.est_minutes) + interval '60 minutes',
            '[)'
          ) && tstzrange(
            b.scheduled_start,
            b.scheduled_start + make_interval(mins => b.replacement_minutes),
            '[)'
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_requests pending_offer
        JOIN public.bookings requested_booking ON requested_booking.id = pending_offer.booking_id
        WHERE pending_offer.pro_id = pp.user_id
          AND pending_offer.status = 'pending'
          AND pending_offer.expires_at > now()
          AND requested_booking.status = 'requested'
          AND tstzrange(
            requested_booking.scheduled_start - interval '60 minutes',
            requested_booking.scheduled_start + make_interval(mins => requested_booking.est_minutes) + interval '60 minutes',
            '[)'
          ) && tstzrange(
            b.scheduled_start - interval '60 minutes',
            b.scheduled_start + make_interval(mins => b.replacement_minutes) + interval '60 minutes',
            '[)'
          )
      )
      AND (
        b.scheduled_start > now() + interval '20 minutes'
        OR EXISTS (
          SELECT 1
          FROM public.pro_presence presence
          WHERE presence.pro_id = pp.user_id
            AND presence.is_online
            AND presence.last_seen_at >= now() - interval '90 seconds'
            AND presence.latitude IS NOT NULL
            AND presence.longitude IS NOT NULL
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.pro_respond_booking_reassignment(
  p_request_id uuid,
  p_accept boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_request public.booking_reassignment_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_pro_service public.pro_services%rowtype;
  v_price numeric(10,2);
  v_minutes integer;
  v_commission_pct numeric(5,2);
  v_commission numeric(10,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO v_request
  FROM public.booking_reassignment_requests
  WHERE id = p_request_id
    AND replacement_pro_id = auth.uid()
    AND status = 'pending'
    AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reassignment request not found or expired'; END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_request.booking_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'scheduled' OR v_booking.pro_id IS DISTINCT FROM v_request.original_pro_id THEN
    RAISE EXCEPTION 'booking changed; reassignment cannot be accepted';
  END IF;

  IF p_accept THEN
    IF NOT public.is_booking_reassignment_candidate(v_booking.id, auth.uid(), v_request.id) THEN
      RAISE EXCEPTION 'you are no longer eligible, correctly priced or available for this service';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payments
      WHERE booking_id = v_booking.id AND status IN ('pending', 'released', 'refunded')
    ) THEN
      RAISE EXCEPTION 'payment state requires financial review; reassignment is blocked';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payouts
      WHERE booking_id = v_booking.id AND status <> 'pending'
    ) THEN
      RAISE EXCEPTION 'payout state requires reconciliation; reassignment is blocked';
    END IF;

    SELECT * INTO v_pro_service
    FROM public.pro_services
    WHERE pro_id = auth.uid()
      AND service_type_id = v_booking.service_type_id
      AND active
    LIMIT 1
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'replacement professional service is no longer available'; END IF;

    IF v_booking.pricing_tier_id IS NOT NULL THEN
      SELECT price_dop, est_minutes
      INTO v_price, v_minutes
      FROM public.pro_service_tier_prices
      WHERE pro_service_id = v_pro_service.id
        AND pricing_tier_id = v_booking.pricing_tier_id
        AND active
      FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'replacement professional has no active price for this service variant';
      END IF;
    ELSE
      v_price := v_pro_service.base_price_dop;
      v_minutes := v_pro_service.est_minutes;
    END IF;

    IF v_price IS NULL OR v_price <= 0 OR v_minutes IS NULL OR v_minutes <= 0 THEN
      RAISE EXCEPTION 'replacement professional tariff is invalid';
    END IF;

    SELECT coalesce((value #>> '{}')::numeric, 7.00)
    INTO v_commission_pct
    FROM public.platform_settings
    WHERE key = 'commission_pct';
    v_commission_pct := coalesce(v_commission_pct, 7.00);
    v_commission := round(v_price * v_commission_pct / 100, 2);

    UPDATE public.bookings
    SET pro_id = auth.uid(),
        pro_service_id = v_pro_service.id,
        est_minutes = v_minutes,
        price_dop = v_price,
        commission_pct = v_commission_pct,
        commission_dop = v_commission,
        pro_payout_dop = v_price - v_commission,
        accepted_at = now(),
        equipment_confirmed_at = NULL,
        equipment_confirmed_by = NULL
    WHERE id = v_booking.id;

    UPDATE public.payouts
    SET pro_id = auth.uid(),
        amount_dop = v_price - v_commission
    WHERE booking_id = v_booking.id
      AND status = 'pending';

    DELETE FROM public.pro_locations WHERE booking_id = v_booking.id;
    DELETE FROM public.booking_eta_tracking WHERE booking_id = v_booking.id;
  END IF;

  UPDATE public.booking_reassignment_requests
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
      responded_at = now()
  WHERE id = v_request.id;

  INSERT INTO public.admin_audit_log(actor_id, action, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_accept THEN 'booking.reassignment_accepted' ELSE 'booking.reassignment_rejected' END,
    v_booking.id,
    jsonb_build_object(
      'request_id', v_request.id,
      'original_pro_id', v_request.original_pro_id,
      'replacement_pro_id', auth.uid(),
      'previous_status', v_booking.status::text,
      'replacement_pro_service_id', CASE WHEN p_accept THEN v_pro_service.id ELSE NULL END,
      'replacement_price_dop', CASE WHEN p_accept THEN v_price ELSE NULL END,
      'replacement_est_minutes', CASE WHEN p_accept THEN v_minutes ELSE NULL END,
      'replacement_commission_dop', CASE WHEN p_accept THEN v_commission ELSE NULL END
    )
  );
END;
$function$;
