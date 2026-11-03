-- Phase 4: simultaneous automatic dispatch.
-- All entry points (immediate requests and the scheduled worker) use the same
-- advisory-locked function so only one dispatch round can be created per booking.

CREATE OR REPLACE FUNCTION public.dispatch_auto_booking(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_created integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_admin_permission('bookings.manage') THEN
    -- Authenticated callers are not allowed; this function is service-role only.
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

  -- Do not create a second round while any offer from the current round is live.
  IF EXISTS (
    SELECT 1 FROM public.booking_requests
    WHERE booking_id = p_booking_id
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.booking_requests (booking_id, pro_id, expires_at)
  SELECT p_booking_id, candidate.pro_id, now() + interval '45 seconds'
  FROM public.find_auto_candidates(p_booking_id, 5) candidate
  ON CONFLICT (booking_id, pro_id) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_auto_booking(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_auto_booking(uuid) TO service_role;

-- Keep the existing travel-time lead calculation, but create a whole round of
-- offers instead of sending one professional at a time.
CREATE OR REPLACE FUNCTION public.process_scheduled_booking_dispatch()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  b record;
  lead_minutes integer;
  dispatched integer := 0;
  created_now integer := 0;
BEGIN
  UPDATE public.booking_requests
  SET status = 'expired', responded_at = coalesce(responded_at, now())
  WHERE status = 'pending' AND expires_at <= now();

  FOR b IN
    SELECT bk.id, bk.scheduled_start, near.distance_m
    FROM public.bookings bk
    LEFT JOIN LATERAL (
      SELECT c.distance_m
      FROM public.find_auto_candidates(bk.id, 1) c
      LIMIT 1
    ) near ON true
    WHERE bk.assignment_mode = 'auto'
      AND bk.status = 'requested'
      AND bk.pro_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_requests r
        WHERE r.booking_id = bk.id
          AND r.status = 'pending'
          AND r.expires_at > now()
      )
    ORDER BY bk.scheduled_start
    LIMIT 100
  LOOP
    -- Approx. 21 km/h travel speed plus 12 minutes for acceptance/preparation.
    -- If nobody eligible is online yet, start looking one hour before the slot.
    lead_minutes := CASE
      WHEN b.distance_m IS NULL THEN 60
      ELSE greatest(15, ceil(b.distance_m / 350.0)::integer + 12)
    END;

    IF b.scheduled_start <= now() + make_interval(mins => lead_minutes) THEN
      created_now := public.dispatch_auto_booking(b.id);
      dispatched := dispatched + created_now;

      IF created_now = 0
         AND b.scheduled_start <= now() - interval '10 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM public.booking_requests r
           WHERE r.booking_id = b.id
             AND r.status = 'pending'
             AND r.expires_at > now()
         ) THEN
        UPDATE public.bookings
        SET status = 'expired'
        WHERE id = b.id
          AND status = 'requested'
          AND pro_id IS NULL;
      END IF;
    END IF;
  END LOOP;

  RETURN dispatched;
END;
$$;

REVOKE ALL ON FUNCTION public.process_scheduled_booking_dispatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_scheduled_booking_dispatch() TO service_role;
