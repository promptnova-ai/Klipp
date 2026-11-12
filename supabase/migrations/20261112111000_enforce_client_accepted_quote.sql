-- Require the client-accepted quote to match the live professional tariff
-- at the exact moment the booking is created. If not, the transaction rolls back
-- and the app must refresh the quote and ask for renewed customer consent.

CREATE OR REPLACE FUNCTION public.create_prepaid_booking_at_location(
  p_pro_service_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_expected_price_dop numeric,
  p_expected_est_minutes integer,
  p_mode public.assignment_mode DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking_id uuid;
  v_booking public.bookings%rowtype;
  v_pro_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_expected_price_dop IS NULL OR p_expected_price_dop <= 0
     OR p_expected_est_minutes IS NULL OR p_expected_est_minutes <= 0 THEN
    RAISE EXCEPTION 'invalid accepted quote';
  END IF;
  IF p_mode NOT IN ('manual'::public.assignment_mode, 'auto'::public.assignment_mode) THEN
    RAISE EXCEPTION 'invalid assignment mode';
  END IF;

  SELECT ps.pro_id INTO v_pro_id
  FROM public.pro_services ps
  JOIN public.pro_profiles pp ON pp.user_id = ps.pro_id
  WHERE ps.id = p_pro_service_id
    AND ps.active
    AND pp.active
    AND pp.verification_status = 'approved'
    AND pp.equipment_policy_accepted_at IS NOT NULL
    AND (p_mode <> 'auto' OR pp.accepts_auto_assign);

  IF v_pro_id IS NULL THEN RAISE EXCEPTION 'professional quote is no longer available'; END IF;

  IF p_mode = 'auto' AND p_scheduled_start <= clock_timestamp() + interval '30 minutes'
     AND NOT EXISTS (
       SELECT 1 FROM public.pro_presence presence
       WHERE presence.pro_id = v_pro_id
         AND presence.is_online
         AND presence.last_seen_at >= clock_timestamp() - interval '90 seconds'
     ) THEN
    RAISE EXCEPTION 'recommended professional is no longer online; refresh the quote';
  END IF;

  v_booking_id := public.create_booking_at_location(
    p_pro_service_id,p_lat,p_lng,p_address_text,p_landmark_notes,p_scheduled_start
  );

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  IF v_booking.price_dop IS DISTINCT FROM p_expected_price_dop
     OR v_booking.est_minutes IS DISTINCT FROM p_expected_est_minutes THEN
    RAISE EXCEPTION 'professional tariff changed; refresh and confirm the new quote';
  END IF;

  IF p_mode = 'auto' THEN
    UPDATE public.bookings
    SET assignment_mode = 'auto'
    WHERE id = v_booking_id AND client_id = auth.uid() AND status = 'payment_pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'automatic quote could not be locked'; END IF;
  END IF;

  RETURN v_booking_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_prepaid_tier_booking_at_location(
  p_pricing_tier_id integer,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_mode public.assignment_mode,
  p_pro_id uuid,
  p_expected_price_dop numeric,
  p_expected_est_minutes integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking_id uuid;
  v_booking public.bookings%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_expected_price_dop IS NULL OR p_expected_price_dop <= 0
     OR p_expected_est_minutes IS NULL OR p_expected_est_minutes <= 0 THEN
    RAISE EXCEPTION 'invalid accepted quote';
  END IF;
  IF p_pro_id IS NULL THEN RAISE EXCEPTION 'a specific professional quote is required'; END IF;

  v_booking_id := public.create_tier_booking_at_location(
    p_pricing_tier_id,p_lat,p_lng,p_address_text,p_landmark_notes,
    p_scheduled_start,p_mode,p_pro_id
  );

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking_id FOR UPDATE;
  IF v_booking.price_dop IS DISTINCT FROM p_expected_price_dop
     OR v_booking.est_minutes IS DISTINCT FROM p_expected_est_minutes THEN
    RAISE EXCEPTION 'professional tariff changed; refresh and confirm the new quote';
  END IF;
  RETURN v_booking_id;
END;
$function$;

-- Prevent direct use of the lower-level RPCs that do not receive the amount
-- the customer actually saw. The wrapper functions above are the only client
-- entry points for creating prepaid bookings.
REVOKE ALL ON FUNCTION public.create_booking_at_location(uuid,double precision,double precision,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_tier_booking_at_location(integer,double precision,double precision,text,text,timestamptz,public.assignment_mode,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_auto_booking_at_location(uuid,double precision,double precision,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_prepaid_booking_at_location(uuid,double precision,double precision,text,text,timestamptz,numeric,integer,public.assignment_mode) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_prepaid_tier_booking_at_location(integer,double precision,double precision,text,text,timestamptz,public.assignment_mode,uuid,numeric,integer) TO authenticated;
