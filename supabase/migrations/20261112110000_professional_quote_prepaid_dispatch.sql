-- Professional-specific quote locking and prepaid dispatch.
-- This migration is intentionally applied to QA first; do not apply to production
-- until AZUL checkout and the client confirmation flow are end-to-end tested.

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  -- Direct professional selection: create a pending-payment booking, never an offer.
  v_definition := pg_get_functiondef('public.create_booking_at_location(uuid,double precision,double precision,text,text,timestamptz)'::regprocedure);
  v_old := '''manual'', ''requested'', p_scheduled_start';
  v_new := '''manual'', ''payment_pending'', p_scheduled_start';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate manual booking status insertion point';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := E'  insert into public.booking_requests (booking_id, pro_id, expires_at)\n  values (v_booking_id, v_offer.pro_id, now() + interval ''2 hours'');\n';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate early manual booking offer creation';
  END IF;
  v_definition := replace(v_definition, v_old, '');

  v_old := '  return v_booking_id;';
  v_new := E'  update public.bookings\n  set payment_due_at = clock_timestamp() + interval ''10 minutes''\n  where id = v_booking_id;\n\n' || v_old;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate manual booking return';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- Tier booking: require an actual professional quote for both manual and
  -- Klipp-selected automatic assignment. The old "minimum price" placeholder
  -- is not a customer quote and must never enter checkout.
  v_definition := pg_get_functiondef('public.create_tier_booking_at_location(integer,double precision,double precision,text,text,timestamptz,public.assignment_mode,uuid)'::regprocedure);

  v_old := 'if (p_mode=''manual'' and p_pro_id is null) or (p_mode=''auto'' and p_pro_id is not null) then raise exception ''invalid professional assignment''; end if;';
  v_new := 'if p_pro_id is null then raise exception ''a specific professional quote is required before checkout''; end if;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate tier booking assignment validation';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'if p_mode=''manual'' then';
  v_new := 'if p_pro_id is not null then';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate tier professional selection branch';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := E'else\n    select min(tp.price_dop),min(tp.est_minutes) into v_price,v_minutes from public.pro_profiles pp\n    join public.pro_services ps on ps.pro_id=pp.user_id and ps.service_type_id=v_tier.service_type_id and ps.active\n    join public.pro_service_tier_prices tp on tp.pro_service_id=ps.id and tp.pricing_tier_id=v_tier.id and tp.active\n    where pp.active and pp.verification_status=''approved'' and pp.equipment_policy_accepted_at is not null and pp.accepts_auto_assign\n      and pp.service_area_latitude is not null\n      and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,v_point,pp.service_area_radius_m);\n    if v_price is null or v_minutes is null then raise exception ''no verified professional with a price for this modality covers this location''; end if;\n  end if;';
  v_new := E'else\n    raise exception ''automatic booking requires a specific professional quote before payment'';\n  end if;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate generic tier price estimate branch';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := '''requested'',p_scheduled_start';
  v_new := '''payment_pending'',p_scheduled_start';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate tier booking status insertion point';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'if p_mode=''manual'' then insert into public.booking_requests(booking_id,pro_id,expires_at) values(v_booking_id,p_pro_id,now()+interval ''2 hours''); end if;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate early tier booking offer creation';
  END IF;
  v_definition := replace(v_definition, v_old, '');

  v_old := '  return v_booking_id;';
  v_new := E'  update public.bookings set payment_due_at=clock_timestamp()+interval ''10 minutes'' where id=v_booking_id;\n  return v_booking_id;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate tier booking return';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;

-- Return a concrete professional and their exact live tariff for the booking
-- confirmation screen. The range shown earlier remains only an estimate.
CREATE OR REPLACE FUNCTION public.get_auto_service_quote(
  p_service_type_id integer,
  p_pricing_tier_id integer,
  p_lat double precision,
  p_lng double precision,
  p_scheduled_start timestamptz,
  p_require_online boolean DEFAULT false
)
RETURNS TABLE(
  pro_service_id uuid,
  pro_id uuid,
  price_dop numeric,
  est_minutes integer,
  pro_name text,
  avatar_url text,
  rating_avg numeric,
  rating_count integer,
  jobs_completed integer,
  distance_m double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_point extensions.geography;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid client location';
  END IF;
  IF p_scheduled_start IS NULL OR p_scheduled_start <= clock_timestamp() THEN
    RAISE EXCEPTION 'booking start must be in the future';
  END IF;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  RETURN QUERY
  SELECT
    ps.id,
    pp.user_id,
    CASE WHEN p_pricing_tier_id IS NULL THEN ps.base_price_dop ELSE tp.price_dop END,
    CASE WHEN p_pricing_tier_id IS NULL THEN ps.est_minutes ELSE tp.est_minutes END,
    pr.full_name,
    pr.avatar_url,
    pp.rating_avg,
    pp.rating_count,
    pp.jobs_completed,
    extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude),4326)::extensions.geography,
      v_point
    )
  FROM public.pro_profiles pp
  JOIN public.pro_services ps
    ON ps.pro_id = pp.user_id
   AND ps.service_type_id = p_service_type_id
   AND ps.active
  LEFT JOIN public.pro_service_tier_prices tp
    ON tp.pro_service_id = ps.id
   AND tp.pricing_tier_id = p_pricing_tier_id
   AND tp.active
  JOIN public.profiles pr ON pr.id = pp.user_id
  WHERE pp.active
    AND pp.verification_status = 'approved'
    AND pp.equipment_policy_accepted_at IS NOT NULL
    AND pp.accepts_auto_assign
    AND pp.service_area_latitude IS NOT NULL
    AND pp.service_area_longitude IS NOT NULL
    AND pp.service_area_radius_m IS NOT NULL
    AND (p_pricing_tier_id IS NULL OR (tp.price_dop > 0 AND tp.est_minutes > 0))
    AND (p_pricing_tier_id IS NOT NULL OR (ps.base_price_dop > 0 AND ps.est_minutes > 0))
    AND extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      v_point,
      pp.service_area_radius_m
    )
    AND (
      NOT p_require_online OR EXISTS (
        SELECT 1 FROM public.pro_presence presence
        WHERE presence.pro_id = pp.user_id
          AND presence.is_online
          AND presence.last_seen_at >= clock_timestamp() - interval '90 seconds'
      )
    )
    AND (p_scheduled_start AT TIME ZONE 'America/Santo_Domingo')::date =
      ((p_scheduled_start + make_interval(mins => CASE WHEN p_pricing_tier_id IS NULL THEN ps.est_minutes ELSE tp.est_minutes END))
        AT TIME ZONE 'America/Santo_Domingo')::date
    AND EXISTS (
      SELECT 1 FROM public.pro_availability av
      WHERE av.pro_id = pp.user_id
        AND av.weekday = extract(isodow from (p_scheduled_start AT TIME ZONE 'America/Santo_Domingo'))::smallint
        AND av.start_time <= (p_scheduled_start AT TIME ZONE 'America/Santo_Domingo')::time
        AND av.end_time >= (
          (p_scheduled_start + make_interval(mins => CASE WHEN p_pricing_tier_id IS NULL THEN ps.est_minutes ELSE tp.est_minutes END))
          AT TIME ZONE 'America/Santo_Domingo'
        )::time
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.pro_id = pp.user_id
        AND b.status IN ('payment_pending','awaiting_payment','scheduled','en_route','arrived','in_progress')
        AND tstzrange(b.scheduled_start - interval '60 minutes',
          b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes','[)')
          && tstzrange(p_scheduled_start,
            p_scheduled_start + make_interval(mins => CASE WHEN p_pricing_tier_id IS NULL THEN ps.est_minutes ELSE tp.est_minutes END),'[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests br
      JOIN public.bookings b ON b.id = br.booking_id
      WHERE br.pro_id = pp.user_id
        AND br.status = 'pending'
        AND br.expires_at > clock_timestamp()
        AND b.status = 'requested'
        AND tstzrange(b.scheduled_start - interval '60 minutes',
          b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes','[)')
          && tstzrange(p_scheduled_start,
            p_scheduled_start + make_interval(mins => CASE WHEN p_pricing_tier_id IS NULL THEN ps.est_minutes ELSE tp.est_minutes END),'[)')
    )
  ORDER BY distance_m ASC, pp.rating_avg DESC, pp.jobs_completed DESC
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_auto_service_quote(integer,integer,double precision,double precision,timestamptz,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auto_service_quote(integer,integer,double precision,double precision,timestamptz,boolean) TO authenticated;

-- The existing no-variant automatic RPC has no professional quote parameter.
-- Retire it rather than allowing a minimum/maximum estimate to be charged.
REVOKE ALL ON FUNCTION public.create_auto_service_booking_at_location(integer,double precision,double precision,text,text,timestamptz) FROM PUBLIC, anon, authenticated;

-- Create an automatic-assignment booking from the exact professional quote.
-- It is still pending payment and has no offer until AZUL verifies payment.
CREATE OR REPLACE FUNCTION public.create_auto_booking_at_location(
  p_pro_service_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_pro_id uuid;
  v_booking_id uuid;
BEGIN
  SELECT ps.pro_id INTO v_pro_id
  FROM public.pro_services ps
  JOIN public.pro_profiles pp ON pp.user_id = ps.pro_id
  WHERE ps.id = p_pro_service_id
    AND ps.active
    AND pp.active
    AND pp.verification_status = 'approved'
    AND pp.accepts_auto_assign
    AND pp.equipment_policy_accepted_at IS NOT NULL;

  IF v_pro_id IS NULL THEN RAISE EXCEPTION 'professional quote is no longer available'; END IF;

  v_booking_id := public.create_booking_at_location(
    p_pro_service_id, p_lat, p_lng, p_address_text, p_landmark_notes, p_scheduled_start
  );

  UPDATE public.bookings
  SET assignment_mode = 'auto'
  WHERE id = v_booking_id
    AND client_id = auth.uid()
    AND status = 'payment_pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'automatic quote could not be locked'; END IF;
  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_auto_booking_at_location(uuid,double precision,double precision,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_auto_booking_at_location(uuid,double precision,double precision,text,text,timestamptz) TO authenticated;

-- Auto dispatch may only offer the exact price and duration the client accepted.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.find_auto_candidates(uuid,integer)'::regprocedure);
  v_old := 'AND (b.pricing_tier_id IS NULL OR (tp.price_dop IS NOT NULL AND tp.est_minutes IS NOT NULL))';
  v_new := E'AND (CASE WHEN b.pricing_tier_id IS NULL THEN ps.base_price_dop ELSE tp.price_dop END) = (SELECT price_dop FROM public.bookings WHERE id = b.id)\n      AND (CASE WHEN b.pricing_tier_id IS NULL THEN ps.est_minutes ELSE tp.est_minutes END) = b.est_minutes';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate exact professional quote guard in automatic candidate query';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- When the initially quoted automatic professional rejects or times out,
  -- release the pin; the existing trigger then dispatches only same-price,
  -- same-duration alternatives.
  v_definition := pg_get_functiondef('public.respond_to_request_unchecked(uuid,boolean)'::regprocedure);
  v_old := E'    UPDATE public.booking_requests\n    SET status = ''rejected'', responded_at = clock_timestamp()\n    WHERE id = v_req.id;\n    RETURN;';
  v_new := E'    UPDATE public.booking_requests\n    SET status = ''rejected'', responded_at = clock_timestamp()\n    WHERE id = v_req.id;\n    UPDATE public.bookings\n    SET pro_id = NULL, pro_service_id = NULL\n    WHERE id = v_req.booking_id\n      AND assignment_mode = ''auto''\n      AND pro_id = v_req.pro_id\n      AND status = ''requested'';\n    RETURN;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate automatic rejection release point';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- A professional must still be charging the exact amount/duration shown to
  -- the customer. Acceptance must never rewrite the financial snapshot.
  v_definition := pg_get_functiondef('public.respond_to_request_unchecked(uuid,boolean)'::regprocedure);
  v_old := E'  IF v_price IS NULL OR v_price <= 0 OR v_minutes IS NULL OR v_minutes <= 0 THEN\n    RAISE EXCEPTION ''professional tariff is invalid'';\n  END IF;';
  v_new := v_old || E'\n  IF v_price IS DISTINCT FROM v_booking.price_dop OR v_minutes IS DISTINCT FROM v_booking.est_minutes THEN\n    RAISE EXCEPTION ''professional tariff no longer matches the accepted quote'';\n  END IF;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate professional tariff validation in acceptance RPC';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := E'  UPDATE public.bookings\n  SET pro_id = v_req.pro_id,\n      pro_service_id = v_pro_service.id,\n      est_minutes = v_minutes,\n      price_dop = v_price,\n      commission_pct = v_commission_pct,\n      commission_dop = v_commission,\n      pro_payout_dop = v_price - v_commission,\n      status = ''awaiting_payment'',\n      accepted_at = clock_timestamp()';
  v_new := E'  UPDATE public.bookings\n  SET pro_id = v_req.pro_id,\n      pro_service_id = v_pro_service.id,\n      status = ''scheduled'',\n      accepted_at = clock_timestamp()';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate financial snapshot rewrite in acceptance RPC';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;

-- AZUL's verified callback sends the first offer to the exact professional
-- quoted by Klipp, whether the booking is manual or Klipp-selected automatic.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.finalize_azul_payment_attempt(uuid,text,numeric,text,text,text,boolean)'::regprocedure);
  v_old := 'IF v_booking.assignment_mode = ''manual'' AND v_booking.pro_id IS NOT NULL THEN';
  v_new := 'IF v_booking.pro_id IS NOT NULL THEN';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate paid booking first-offer gate';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
