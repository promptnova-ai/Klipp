-- Phase 5: professional variant pricing and 7% platform commission.
-- Prices are captured from the accepting professional before payment is requested.

-- Klipp's platform commission is 7% of the service price.
INSERT INTO public.platform_settings (key, value)
VALUES ('commission_pct', '7'::jsonb)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value, updated_at = now();

-- A professional can set a different price and duration for each catalog variant.
CREATE TABLE IF NOT EXISTS public.pro_service_tier_prices (
  pro_service_id uuid NOT NULL REFERENCES public.pro_services(id) ON DELETE CASCADE,
  pricing_tier_id integer NOT NULL REFERENCES public.pricing_tiers(id) ON DELETE CASCADE,
  price_dop numeric(10,2) NOT NULL CHECK (price_dop > 0),
  est_minutes integer NOT NULL CHECK (est_minutes > 0),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pro_service_id, pricing_tier_id)
);

CREATE INDEX IF NOT EXISTS pro_service_tier_prices_tier_idx
  ON public.pro_service_tier_prices (pricing_tier_id, active);

ALTER TABLE public.pro_service_tier_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pro_service_tier_prices_read_active ON public.pro_service_tier_prices;
CREATE POLICY pro_service_tier_prices_read_active
  ON public.pro_service_tier_prices
  FOR SELECT TO authenticated
  USING (
    active AND EXISTS (
      SELECT 1 FROM public.pro_services ps
      WHERE ps.id = pro_service_id AND ps.active
    )
  );

DROP POLICY IF EXISTS pro_service_tier_prices_manage_own ON public.pro_service_tier_prices;
CREATE POLICY pro_service_tier_prices_manage_own
  ON public.pro_service_tier_prices
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pro_services ps
      WHERE ps.id = pro_service_id AND ps.pro_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pro_services ps
      WHERE ps.id = pro_service_id AND ps.pro_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_service_tier_prices TO authenticated;
GRANT ALL ON public.pro_service_tier_prices TO service_role;

-- Candidate discovery must only notify professionals who have priced the
-- exact selected variant. This prevents an offer being accepted at a guessed price.
CREATE OR REPLACE FUNCTION public.find_auto_candidates(p_booking_id uuid, p_limit integer DEFAULT 5)
RETURNS TABLE(pro_id uuid, distance_m double precision, rating_avg numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH b AS (
    SELECT id, scheduled_start, est_minutes, service_type_id, pricing_tier_id,
      extensions.st_setsrid(extensions.st_makepoint(client_lng, client_lat), 4326)::extensions.geography AS point
    FROM public.bookings
    WHERE id = p_booking_id
      AND assignment_mode = 'auto'
      AND status = 'requested'
      AND pro_id IS NULL
      AND client_lat IS NOT NULL
      AND client_lng IS NOT NULL
  )
  SELECT pp.user_id,
    extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(pr.longitude, pr.latitude), 4326)::extensions.geography,
      b.point
    ),
    pp.rating_avg
  FROM b
  JOIN public.pro_profiles pp ON pp.active
  JOIN public.pro_presence pr ON pr.pro_id = pp.user_id
  WHERE pp.verification_status = 'approved'
    AND pp.accepts_auto_assign
    AND pp.equipment_policy_accepted_at IS NOT NULL
    AND pp.service_area_latitude IS NOT NULL
    AND pr.is_online
    AND pr.last_seen_at >= now() - interval '90 seconds'
    AND EXISTS (
      SELECT 1 FROM public.pro_services ps
      WHERE ps.pro_id = pp.user_id
        AND ps.service_type_id = b.service_type_id
        AND ps.active
        AND (
          b.pricing_tier_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.pro_service_tier_prices tp
            WHERE tp.pro_service_id = ps.id
              AND tp.pricing_tier_id = b.pricing_tier_id
              AND tp.active
          )
        )
    )
    AND extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326)::extensions.geography,
      b.point,
      pp.service_area_radius_m
    )
    AND EXISTS (
      SELECT 1 FROM public.pro_availability av
      WHERE av.pro_id = pp.user_id
        AND av.weekday = extract(isodow from (b.scheduled_start at time zone 'America/Santo_Domingo'))::smallint
        AND av.start_time <= (b.scheduled_start at time zone 'America/Santo_Domingo')::time
        AND av.end_time >= ((b.scheduled_start + make_interval(mins => b.est_minutes)) at time zone 'America/Santo_Domingo')::time
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings ob
      WHERE ob.pro_id = pp.user_id
        AND ob.status IN ('awaiting_payment','scheduled','en_route','arrived','in_progress')
        AND tstzrange(ob.scheduled_start - interval '60 minutes',
          ob.scheduled_start + make_interval(mins => ob.est_minutes) + interval '60 minutes','[)')
        && tstzrange(b.scheduled_start,b.scheduled_start + make_interval(mins => b.est_minutes),'[)')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests old
      WHERE old.booking_id = b.id AND old.pro_id = pp.user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_requests pending
      JOIN public.bookings ob ON ob.id = pending.booking_id
      WHERE pending.pro_id = pp.user_id
        AND pending.status = 'pending'
        AND pending.expires_at > now()
        AND ob.id <> b.id
    )
  ORDER BY 2, pp.rating_avg DESC, pp.jobs_completed DESC
  LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$$;

REVOKE ALL ON FUNCTION public.find_auto_candidates(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_auto_candidates(uuid, integer) TO service_role;

-- The first valid acceptance fixes the actual professional price and snapshots
-- the 7% commission/payout. Payment cannot proceed at the generic tier estimate.
CREATE OR REPLACE FUNCTION public.respond_to_request(p_request_id uuid, p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'request not found or expired'; END IF;

  IF NOT p_accept THEN
    UPDATE public.booking_requests
    SET status = 'rejected', responded_at = now()
    WHERE id = v_req.id;
    RETURN;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_req.booking_id
    AND status = 'requested'
    AND pro_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking no longer available'; END IF;

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
      accepted_at = now()
  WHERE id = v_booking.id
    AND status = 'requested'
    AND pro_id IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking no longer available'; END IF;

  UPDATE public.booking_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = v_req.id;

  UPDATE public.booking_requests
  SET status = 'expired', responded_at = now()
  WHERE booking_id = v_req.booking_id
    AND id <> v_req.id
    AND status = 'pending';
END;
$$;


-- Indicative range from professionals who cover the requested location and
-- have published the exact service/variant price. The final price is still
-- locked only when a professional accepts the booking.
CREATE OR REPLACE FUNCTION public.get_auto_service_price_estimate(
  p_service_type_id integer,
  p_pricing_tier_id integer,
  p_lat double precision,
  p_lng double precision
)
RETURNS TABLE(min_price_dop numeric, max_price_dop numeric, professional_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_point extensions.geography;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid location';
  END IF;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  RETURN QUERY
  SELECT
    min(CASE WHEN p_pricing_tier_id IS NULL THEN ps.base_price_dop ELSE tp.price_dop END)::numeric,
    max(CASE WHEN p_pricing_tier_id IS NULL THEN ps.base_price_dop ELSE tp.price_dop END)::numeric,
    count(DISTINCT pp.user_id)::integer
  FROM public.pro_profiles pp
  JOIN public.pro_services ps
    ON ps.pro_id = pp.user_id
   AND ps.service_type_id = p_service_type_id
   AND ps.active
  LEFT JOIN public.pro_service_tier_prices tp
    ON tp.pro_service_id = ps.id
   AND tp.pricing_tier_id = p_pricing_tier_id
   AND tp.active
  WHERE pp.active
    AND pp.verification_status = 'approved'
    AND pp.equipment_policy_accepted_at IS NOT NULL
    AND pp.service_area_latitude IS NOT NULL
    AND extensions.st_dwithin(
      extensions.st_setsrid(
        extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
      )::extensions.geography,
      v_point,
      pp.service_area_radius_m
    )
    AND (p_pricing_tier_id IS NULL OR tp.price_dop IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.get_auto_service_price_estimate(integer, integer, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auto_service_price_estimate(integer, integer, double precision, double precision) TO authenticated;


-- Services without catalog variants can also be booked in automatic mode.
-- The initial price is the local minimum only as a provisional estimate; the
-- acceptance RPC replaces it with the accepting professional's exact tariff.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_service_source_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_service_source_check
  CHECK (
    pricing_tier_id IS NOT NULL
    OR pro_service_id IS NOT NULL
    OR assignment_mode = 'auto'
  );

CREATE OR REPLACE FUNCTION public.create_auto_service_booking_at_location(
  p_service_type_id integer,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_service public.service_types%rowtype;
  v_point extensions.geography;
  v_address_id uuid;
  v_booking_id uuid;
  v_estimated_price numeric(10,2);
  v_estimated_minutes integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid location';
  END IF;
  IF p_scheduled_start <= now() THEN RAISE EXCEPTION 'start must be in the future'; END IF;

  SELECT * INTO v_service
  FROM public.service_types
  WHERE id = p_service_type_id AND active;

  IF NOT FOUND THEN RAISE EXCEPTION 'invalid service'; END IF;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  SELECT min(ps.base_price_dop), max(ps.est_minutes)
  INTO v_estimated_price, v_estimated_minutes
  FROM public.pro_services ps
  JOIN public.pro_profiles pp ON pp.user_id = ps.pro_id
  WHERE ps.service_type_id = p_service_type_id
    AND ps.active
    AND pp.active
    AND pp.verification_status = 'approved'
    AND pp.equipment_policy_accepted_at IS NOT NULL
    AND pp.service_area_latitude IS NOT NULL
    AND extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326)::extensions.geography,
      v_point,
      pp.service_area_radius_m
    );

  IF v_estimated_price IS NULL OR v_estimated_minutes IS NULL THEN
    RAISE EXCEPTION 'no professional with a published price covers this location';
  END IF;

  INSERT INTO public.addresses (client_id, label, street, references_text, sector_id, location)
  VALUES (
    auth.uid(), 'Ubicación de reserva', nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''), null, v_point
  )
  RETURNING id INTO v_address_id;

  INSERT INTO public.bookings (
    client_id, service_type_id, pricing_tier_id, pro_service_id, address_id,
    assignment_mode, status, scheduled_start, est_minutes, price_dop,
    notes, client_lat, client_lng, address_text, landmark_notes
  )
  VALUES (
    auth.uid(), p_service_type_id, null, null, v_address_id,
    'auto', 'requested', p_scheduled_start, v_estimated_minutes, v_estimated_price,
    nullif(trim(p_landmark_notes), ''), p_lat, p_lng,
    nullif(trim(p_address_text), ''), nullif(trim(p_landmark_notes), '')
  )
  RETURNING id INTO v_booking_id;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_auto_service_booking_at_location(integer, double precision, double precision, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_auto_service_booking_at_location(integer, double precision, double precision, text, text, timestamptz) TO authenticated;
