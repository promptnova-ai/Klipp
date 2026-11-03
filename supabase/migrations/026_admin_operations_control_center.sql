-- Phase 3: secure operational visibility for the Klipp control center.
-- Read-only RPCs: staff can inspect orders only with bookings.read.
-- No direct table grants, booking mutations, or service-role key in the client.

CREATE OR REPLACE FUNCTION public.admin_list_operational_bookings(
  p_limit integer DEFAULT 150
)
RETURNS TABLE (
  booking_id uuid,
  status text,
  assignment_mode text,
  scheduled_start timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  en_route_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  service_name text,
  client_name text,
  professional_name text,
  address_text text,
  price_dop numeric,
  est_minutes integer,
  pro_latitude double precision,
  pro_longitude double precision,
  pro_location_updated_at timestamptz,
  current_eta_minutes integer,
  eta_updated_at timestamptz,
  status_event_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('bookings.read') THEN
    RAISE EXCEPTION 'permission denied: bookings.read';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'limit must be between 1 and 300';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.status::text,
    b.assignment_mode::text,
    b.scheduled_start,
    b.created_at,
    b.accepted_at,
    b.en_route_at,
    b.arrived_at,
    b.started_at,
    b.completed_at,
    st.name,
    client_profile.full_name,
    pro_profile.full_name,
    COALESCE(b.address_text, a.street, a.label),
    b.price_dop,
    b.est_minutes,
    CASE WHEN pl.location IS NOT NULL THEN extensions.st_y(pl.location::extensions.geometry) END,
    CASE WHEN pl.location IS NOT NULL THEN extensions.st_x(pl.location::extensions.geometry) END,
    pl.updated_at,
    eta.last_notified_eta_minutes,
    eta.updated_at,
    (SELECT count(*) FROM public.booking_status_events event WHERE event.booking_id = b.id)
  FROM public.bookings b
  LEFT JOIN public.service_types st ON st.id = b.service_type_id
  LEFT JOIN public.profiles client_profile ON client_profile.id = b.client_id
  LEFT JOIN public.profiles pro_profile ON pro_profile.id = b.pro_id
  LEFT JOIN public.addresses a ON a.id = b.address_id
  LEFT JOIN public.pro_locations pl ON pl.booking_id = b.id AND pl.pro_id = b.pro_id
  LEFT JOIN public.booking_eta_tracking eta ON eta.booking_id = b.id
  WHERE b.status IN (
    'requested', 'awaiting_payment', 'scheduled',
    'en_route', 'arrived', 'in_progress', 'disputed'
  )
  ORDER BY
    CASE WHEN b.status = 'disputed' THEN 0 ELSE 1 END,
    b.scheduled_start ASC,
    b.created_at ASC
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_booking_timeline(p_booking_id uuid)
RETURNS TABLE (
  event_id bigint,
  from_status text,
  to_status text,
  occurred_at timestamptz,
  actor_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('bookings.read') THEN
    RAISE EXCEPTION 'permission denied: bookings.read';
  END IF;
  IF p_booking_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.bookings WHERE id = p_booking_id
  ) THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  RETURN QUERY
  SELECT
    event.id,
    event.from_status::text,
    event.to_status::text,
    event.occurred_at,
    actor.full_name
  FROM public.booking_status_events event
  LEFT JOIN public.profiles actor ON actor.id = event.actor_id
  WHERE event.booking_id = p_booking_id
  ORDER BY event.occurred_at ASC, event.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_operational_bookings(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_booking_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_operational_bookings(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_booking_timeline(uuid) TO authenticated;
