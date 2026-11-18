-- Stripe checkout booking creation.
-- Creates a booking in payment_pending without creating a professional request.
-- The server owns price/duration validation; no client-supplied quote is trusted.

CREATE OR REPLACE FUNCTION public.create_stripe_prepaid_booking_at_location(
  p_pro_service_id uuid,
  p_pricing_tier_id integer,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_expected_price_dop numeric,
  p_expected_est_minutes integer,
  p_mode public.assignment_mode
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_offer public.pro_services%rowtype;
  v_pro public.pro_profiles%rowtype;
  v_price numeric(10,2);
  v_minutes integer;
  v_point extensions.geography;
  v_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_address_id uuid;
  v_booking_id uuid;
  v_payment_due_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_pro_service_id IS NULL
     OR p_mode IS NULL
     OR p_mode NOT IN ('manual'::public.assignment_mode, 'auto'::public.assignment_mode)
     OR p_lat IS NULL OR p_lat NOT BETWEEN -90 AND 90
     OR p_lng IS NULL OR p_lng NOT BETWEEN -180 AND 180
     OR p_scheduled_start IS NULL
     OR p_expected_price_dop IS NULL OR p_expected_price_dop <= 0
     OR p_expected_est_minutes IS NULL OR p_expected_est_minutes <= 0 THEN
    RAISE EXCEPTION 'invalid booking details';
  END IF;

  IF p_scheduled_start <= clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'booking must start at least five minutes in the future to allow secure checkout';
  END IF;

  SELECT * INTO v_offer
  FROM public.pro_services
  WHERE id = p_pro_service_id AND active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional service offer is no longer available';
  END IF;

  SELECT * INTO v_pro
  FROM public.pro_profiles
  WHERE user_id = v_offer.pro_id
    AND active
    AND verification_status = 'approved'
    AND equipment_policy_accepted_at IS NOT NULL;

  IF NOT FOUND OR v_pro.service_area_latitude IS NULL
     OR v_pro.service_area_longitude IS NULL
     OR v_pro.service_area_radius_m IS NULL THEN
    RAISE EXCEPTION 'professional is not eligible to receive this booking';
  END IF;

  IF p_mode = 'auto' AND NOT v_pro.accepts_auto_assign THEN
    RAISE EXCEPTION 'professional does not accept automatic assignment';
  END IF;

  IF p_pricing_tier_id IS NULL THEN
    v_price := v_offer.base_price_dop;
    v_minutes := v_offer.est_minutes;
  ELSE
    SELECT price_dop, est_minutes
    INTO v_price, v_minutes
    FROM public.pro_service_tier_prices
    WHERE pro_service_id = p_pro_service_id
      AND pricing_tier_id = p_pricing_tier_id
      AND active;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'professional has not configured this service variant';
    END IF;
  END IF;

  IF v_price IS DISTINCT FROM p_expected_price_dop
     OR v_minutes IS DISTINCT FROM p_expected_est_minutes THEN
    RAISE EXCEPTION 'professional tariff changed; refresh and confirm the updated price';
  END IF;

  v_point := extensions.st_setsrid(
    extensions.st_makepoint(p_lng, p_lat), 4326
  )::extensions.geography;

  IF NOT extensions.st_dwithin(
    extensions.st_setsrid(
      extensions.st_makepoint(v_pro.service_area_longitude, v_pro.service_area_latitude), 4326
    )::extensions.geography,
    v_point,
    v_pro.service_area_radius_m
  ) THEN
    RAISE EXCEPTION 'professional does not serve this location';
  END IF;

  v_local := p_scheduled_start AT TIME ZONE 'America/Santo_Domingo';
  v_end_local := (p_scheduled_start + make_interval(mins => v_minutes))
    AT TIME ZONE 'America/Santo_Domingo';

  IF v_local::date <> v_end_local::date THEN
    RAISE EXCEPTION 'service must fit within one local calendar day';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('klipp_booking_pro'),
    hashtext(v_offer.pro_id::text)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.pro_availability av
    WHERE av.pro_id = v_offer.pro_id
      AND av.weekday = extract(isodow FROM v_local)::smallint
      AND av.start_time <= v_local::time
      AND av.end_time >= v_end_local::time
  ) THEN
    RAISE EXCEPTION 'professional is not available for the full service window';
  END IF;

  IF p_mode = 'auto' AND p_scheduled_start <= clock_timestamp() + interval '30 minutes'
     AND NOT EXISTS (
       SELECT 1
       FROM public.pro_presence presence
       WHERE presence.pro_id = v_offer.pro_id
         AND presence.is_online
         AND presence.last_seen_at >= clock_timestamp() - interval '90 seconds'
         AND presence.latitude IS NOT NULL
         AND presence.longitude IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'recommended professional is no longer online; refresh the quote';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.pro_id = v_offer.pro_id
      AND b.status IN ('payment_pending','awaiting_payment','scheduled','en_route','arrived','in_progress')
      AND tstzrange(
        b.scheduled_start - interval '60 minutes',
        b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
        '[)'
      ) && tstzrange(
        p_scheduled_start,
        p_scheduled_start + make_interval(mins => v_minutes),
        '[)'
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.booking_requests br
    JOIN public.bookings b ON b.id = br.booking_id
    WHERE br.pro_id = v_offer.pro_id
      AND br.status = 'pending'
      AND br.expires_at > clock_timestamp()
      AND b.status = 'requested'
      AND tstzrange(
        b.scheduled_start - interval '60 minutes',
        b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
        '[)'
      ) && tstzrange(
        p_scheduled_start,
        p_scheduled_start + make_interval(mins => v_minutes),
        '[)'
      )
  ) THEN
    RAISE EXCEPTION 'professional already has a booking or pending offer in that time window';
  END IF;

  v_payment_due_at := least(
    clock_timestamp() + interval '10 minutes',
    p_scheduled_start - interval '5 minutes'
  );

  INSERT INTO public.addresses (
    client_id, label, street, references_text, sector_id, location
  )
  VALUES (
    auth.uid(),
    'Ubicación de reserva',
    nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''),
    null,
    v_point
  )
  RETURNING id INTO v_address_id;

  INSERT INTO public.bookings (
    client_id, pro_id, service_type_id, pricing_tier_id, pro_service_id, address_id,
    assignment_mode, status, scheduled_start, est_minutes, price_dop,
    commission_pct, commission_dop, pro_payout_dop, notes,
    client_lat, client_lng, address_text, landmark_notes,
    payment_due_at, price_locked_at
  )
  VALUES (
    auth.uid(), v_offer.pro_id, v_offer.service_type_id, p_pricing_tier_id,
    v_offer.id, v_address_id, p_mode, 'payment_pending',
    p_scheduled_start, v_minutes, v_price,
    7.00, round(v_price * 0.07, 2), v_price - round(v_price * 0.07, 2),
    nullif(trim(p_landmark_notes), ''),
    p_lat, p_lng, nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''),
    v_payment_due_at, clock_timestamp()
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_stripe_prepaid_booking_at_location(
  uuid, integer, double precision, double precision, text, text, timestamptz, numeric, integer, public.assignment_mode
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stripe_prepaid_booking_at_location(
  uuid, integer, double precision, double precision, text, text, timestamptz, numeric, integer, public.assignment_mode
) TO authenticated;
