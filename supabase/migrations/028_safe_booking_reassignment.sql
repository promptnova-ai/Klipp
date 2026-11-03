-- Phase 3.2: controlled reassignment of confirmed (scheduled) bookings.
-- The current professional remains assigned until the replacement explicitly accepts.
-- Payments remain attached to the booking; only an unpaid payout recipient may change.

CREATE TABLE public.booking_reassignment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  original_pro_id uuid NOT NULL REFERENCES public.pro_profiles(user_id),
  replacement_pro_id uuid NOT NULL REFERENCES public.pro_profiles(user_id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 500),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','expired','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  CHECK (original_pro_id <> replacement_pro_id)
);

CREATE INDEX booking_reassignment_pending_pro_idx
  ON public.booking_reassignment_requests(replacement_pro_id, status, expires_at);
CREATE INDEX booking_reassignment_booking_idx
  ON public.booking_reassignment_requests(booking_id, created_at DESC);

ALTER TABLE public.booking_reassignment_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.booking_reassignment_requests FROM PUBLIC, anon, authenticated;
-- Access is intentionally RPC-only. Admin notes/reasons and both parties' IDs
-- are not exposed through direct table reads.

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
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.pro_profiles pp ON pp.user_id = p_pro_id
    WHERE b.id = p_booking_id
      AND b.status = 'scheduled'
      AND b.pro_id IS NOT NULL
      AND b.scheduled_start > now()
      AND pp.user_id <> b.pro_id
      AND pp.active
      AND pp.verification_status = 'approved'
      AND EXISTS (
        SELECT 1 FROM public.service_types service
        WHERE service.id = b.service_type_id AND service.active
      )
      AND (b.scheduled_start AT TIME ZONE 'America/Santo_Domingo')::date
        = ((b.scheduled_start + make_interval(mins => b.est_minutes)) AT TIME ZONE 'America/Santo_Domingo')::date
      AND pp.equipment_policy_accepted_at IS NOT NULL
      AND pp.service_area_latitude IS NOT NULL
      AND pp.service_area_longitude IS NOT NULL
      AND pp.service_area_radius_m IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.pro_services ps
        WHERE ps.pro_id = pp.user_id
          AND ps.service_type_id = b.service_type_id
          AND ps.active
      )
      AND b.client_lat IS NOT NULL
      AND b.client_lng IS NOT NULL
      AND extensions.st_dwithin(
        extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
        extensions.st_setsrid(extensions.st_makepoint(b.client_lng,b.client_lat),4326)::extensions.geography,
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
        SELECT 1 FROM public.booking_reassignment_requests pending_request
        WHERE pending_request.replacement_pro_id = pp.user_id
          AND pending_request.status = 'pending'
          AND pending_request.expires_at > now()
          AND pending_request.id IS DISTINCT FROM p_ignore_request_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings other_booking
        WHERE other_booking.pro_id = pp.user_id
          AND other_booking.id <> b.id
          AND other_booking.status IN ('awaiting_payment','scheduled','en_route','arrived','in_progress')
          AND tstzrange(
            other_booking.scheduled_start - interval '60 minutes',
            other_booking.scheduled_start + make_interval(mins => other_booking.est_minutes) + interval '60 minutes',
            '[)'
          ) && tstzrange(
            b.scheduled_start,
            b.scheduled_start + make_interval(mins => b.est_minutes),
            '[)'
          )
      )
      AND (
        b.scheduled_start > now() + interval '20 minutes'
        OR EXISTS (
          SELECT 1 FROM public.pro_presence presence
          WHERE presence.pro_id = pp.user_id
            AND presence.is_online
            AND presence.last_seen_at >= now() - interval '90 seconds'
            AND presence.latitude IS NOT NULL
            AND presence.longitude IS NOT NULL
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_booking_reassignment_candidate(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_booking_reassignment_candidates(p_booking_id uuid)
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
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('bookings.manage') THEN
    RAISE EXCEPTION 'permission denied: bookings.manage';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'scheduled' OR v_booking.pro_id IS NULL OR v_booking.scheduled_start <= now() THEN
    RAISE EXCEPTION 'only future confirmed bookings with an assigned professional can be reassigned';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_reassignment_requests r
    WHERE r.booking_id = p_booking_id AND r.status = 'pending' AND r.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'this booking already has a pending reassignment request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE booking_id = p_booking_id AND status IN ('pending','released','refunded')
  ) THEN
    RAISE EXCEPTION 'payment state requires financial review before reassignment';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payouts
    WHERE booking_id = p_booking_id AND status <> 'pending'
  ) THEN
    RAISE EXCEPTION 'payout state requires reconciliation before reassignment';
  END IF;

  RETURN QUERY
  SELECT
    pp.user_id,
    profile.full_name,
    pp.rating_avg,
    pp.jobs_completed,
    round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(v_booking.client_lng,v_booking.client_lat),4326)::extensions.geography
    ) / 1000.0)::numeric, 1),
    coalesce(presence.is_online AND presence.last_seen_at >= now() - interval '90 seconds', false),
    presence.last_seen_at
  FROM public.pro_profiles pp
  JOIN public.profiles profile ON profile.id = pp.user_id
  LEFT JOIN public.pro_presence presence ON presence.pro_id = pp.user_id
  WHERE pp.user_id <> v_booking.pro_id
    AND public.is_booking_reassignment_candidate(p_booking_id, pp.user_id, NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.booking_reassignment_requests existing
      WHERE existing.booking_id = p_booking_id
        AND existing.replacement_pro_id = pp.user_id
        AND existing.status IN ('pending','accepted')
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

CREATE OR REPLACE FUNCTION public.admin_create_booking_reassignment(
  p_booking_id uuid,
  p_replacement_pro_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_request_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('bookings.manage') THEN
    RAISE EXCEPTION 'permission denied: bookings.manage';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 OR length(trim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'enter a reason between 5 and 500 characters';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'scheduled' OR v_booking.pro_id IS NULL THEN
    RAISE EXCEPTION 'only scheduled bookings can be reassigned; en-route or started services are locked';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.booking_reassignment_requests r
    WHERE r.booking_id = p_booking_id AND r.status = 'pending' AND r.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'this booking already has a pending reassignment request';
  END IF;

  UPDATE public.booking_reassignment_requests
  SET status = 'expired', responded_at = coalesce(responded_at, now())
  WHERE booking_id = p_booking_id AND status = 'pending' AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE booking_id = p_booking_id AND status IN ('pending','released','refunded')
  ) THEN
    RAISE EXCEPTION 'payment is pending, released or refunded; financial review is required before reassignment';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payouts
    WHERE booking_id = p_booking_id AND status <> 'pending'
  ) THEN
    RAISE EXCEPTION 'a payout has already been processed or needs reconciliation';
  END IF;
  IF NOT public.is_booking_reassignment_candidate(p_booking_id, p_replacement_pro_id, NULL) THEN
    RAISE EXCEPTION 'replacement professional is no longer eligible or available';
  END IF;

  INSERT INTO public.booking_reassignment_requests (
    booking_id, original_pro_id, replacement_pro_id, created_by, reason, expires_at
  ) VALUES (
    p_booking_id, v_booking.pro_id, p_replacement_pro_id, auth.uid(), trim(p_reason), now() + interval '15 minutes'
  ) RETURNING id INTO v_request_id;

  INSERT INTO public.admin_audit_log(actor_id, action, target_id, details)
  VALUES (
    auth.uid(), 'booking.reassignment_requested', p_booking_id,
    jsonb_build_object(
      'request_id', v_request_id,
      'original_pro_id', v_booking.pro_id,
      'replacement_pro_id', p_replacement_pro_id,
      'reason', trim(p_reason),
      'expires_at', now() + interval '15 minutes',
      'booking_status', v_booking.status::text
    )
  );

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pro_list_pending_booking_reassignments()
RETURNS TABLE (
  request_id uuid,
  booking_id uuid,
  original_professional_name text,
  scheduled_start timestamptz,
  est_minutes integer,
  pro_payout_dop numeric,
  address_text text,
  landmark_notes text,
  service_name text,
  pricing_tier_label text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  UPDATE public.booking_reassignment_requests
  SET status = 'expired', responded_at = now()
  WHERE replacement_pro_id = auth.uid()
    AND status = 'pending'
    AND expires_at <= now();

  RETURN QUERY
  SELECT r.id, b.id, original_profile.full_name, b.scheduled_start, b.est_minutes,
    b.pro_payout_dop, b.address_text, b.landmark_notes, service.name, tier.label, r.expires_at
  FROM public.booking_reassignment_requests r
  JOIN public.bookings b ON b.id = r.booking_id
  JOIN public.profiles original_profile ON original_profile.id = r.original_pro_id
  JOIN public.service_types service ON service.id = b.service_type_id
  LEFT JOIN public.pricing_tiers tier ON tier.id = b.pricing_tier_id
  WHERE r.replacement_pro_id = auth.uid()
    AND r.status = 'pending'
    AND r.expires_at > now()
    AND b.status = 'scheduled'
    AND b.pro_id = r.original_pro_id
  ORDER BY b.scheduled_start;
END;
$$;

CREATE OR REPLACE FUNCTION public.pro_list_pending_reassignment_locks()
RETURNS TABLE (booking_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT r.booking_id
  FROM public.booking_reassignment_requests r
  JOIN public.bookings b ON b.id = r.booking_id
  WHERE r.original_pro_id = auth.uid()
    AND r.status = 'pending'
    AND r.expires_at > now()
    AND b.pro_id = r.original_pro_id
    AND b.status = 'scheduled';
$$;

CREATE OR REPLACE FUNCTION public.pro_respond_booking_reassignment(
  p_request_id uuid,
  p_accept boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.booking_reassignment_requests%rowtype;
  v_booking public.bookings%rowtype;
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
      RAISE EXCEPTION 'you are no longer eligible or available for this service';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payments
      WHERE booking_id = v_booking.id AND status IN ('pending','released','refunded')
    ) THEN
      RAISE EXCEPTION 'payment state requires financial review; reassignment is blocked';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.payouts
      WHERE booking_id = v_booking.id AND status <> 'pending'
    ) THEN
      RAISE EXCEPTION 'payout state requires reconciliation; reassignment is blocked';
    END IF;

    UPDATE public.bookings
    SET pro_id = auth.uid(),
        accepted_at = now(),
        equipment_confirmed_at = NULL,
        equipment_confirmed_by = NULL
    WHERE id = v_booking.id;

    UPDATE public.payouts
    SET pro_id = auth.uid()
    WHERE booking_id = v_booking.id AND status = 'pending';

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
      'previous_status', v_booking.status::text
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_booking_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%rowtype;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_klipp_notification(
      NEW.original_pro_id, NEW.booking_id, 'booking_reassignment',
      'Cambio de profesional en revisión',
      'Klipp está gestionando un posible cambio de profesional para esta reserva. No avances el servicio mientras la solicitud esté pendiente.',
      jsonb_build_object('bookingId', NEW.booking_id, 'target', 'pro', 'reassignmentId', NEW.id, 'reassignmentRole', 'original'),
      'booking-reassignment:' || NEW.id::text || ':original',
      'booking_updates'
    );
    PERFORM public.create_klipp_notification(
      NEW.replacement_pro_id, NEW.booking_id, 'booking_reassignment',
      'Solicitud de sustitución',
      'Klipp te invita a asumir una reserva confirmada. Revisa los detalles y acepta o rechaza desde Solicitudes.',
      jsonb_build_object('bookingId', NEW.booking_id, 'target', 'pro', 'reassignmentId', NEW.id, 'reassignmentRole', 'replacement'),
      'booking-reassignment:' || NEW.id::text || ':replacement',
      'booking_updates'
    );
    PERFORM public.create_klipp_notification(
      v_booking.client_id, NEW.booking_id, 'booking_update',
      'Estamos gestionando tu reserva',
      'Estamos coordinando un posible cambio de profesional. Te avisaremos cuando quede confirmado.',
      jsonb_build_object('bookingId', NEW.booking_id, 'target', 'client'),
      'booking-reassignment:' || NEW.id::text || ':client-pending',
      'booking_updates'
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted' THEN
      PERFORM public.create_klipp_notification(
        NEW.original_pro_id, NEW.booking_id, 'booking_reassignment',
        'Sustitución confirmada',
        'Otro profesional ha aceptado la reserva. Ya no necesitas atender este servicio.',
        jsonb_build_object('bookingId', NEW.booking_id, 'target', 'pro'),
        'booking-reassignment:' || NEW.id::text || ':original-accepted',
        'booking_updates'
      );
      PERFORM public.create_klipp_notification(
        NEW.replacement_pro_id, NEW.booking_id, 'booking_reassignment',
        'Reserva asignada a tu agenda',
        'Has aceptado la sustitución. La reserva ya aparece en tu agenda.',
        jsonb_build_object('bookingId', NEW.booking_id, 'target', 'pro'),
        'booking-reassignment:' || NEW.id::text || ':replacement-accepted',
        'booking_updates'
      );
      PERFORM public.create_klipp_notification(
        v_booking.client_id, NEW.booking_id, 'booking_update',
        'Profesional actualizado',
        'El cambio de profesional está confirmado. Consulta tu reserva en Klipp.',
        jsonb_build_object('bookingId', NEW.booking_id, 'target', 'client'),
        'booking-reassignment:' || NEW.id::text || ':client-accepted',
        'booking_updates'
      );
    ELSIF NEW.status IN ('rejected','expired','cancelled') THEN
      PERFORM public.create_klipp_notification(
        NEW.original_pro_id, NEW.booking_id, 'booking_reassignment',
        'La solicitud de sustitución ha terminado',
        'La solicitud no se ha completado. Tu asignación original continúa vigente.',
        jsonb_build_object('bookingId', NEW.booking_id, 'target', 'pro'),
        'booking-reassignment:' || NEW.id::text || ':original-' || NEW.status,
        'booking_updates'
      );
      PERFORM public.create_klipp_notification(
        v_booking.client_id, NEW.booking_id, 'booking_update',
        'Actualización de tu reserva',
        'El cambio de profesional no se ha completado. Tu reserva sigue asignada al profesional original.',
        jsonb_build_object('bookingId', NEW.booking_id, 'target', 'client'),
        'booking-reassignment:' || NEW.id::text || ':client-' || NEW.status,
        'booking_updates'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_reassignment_notifications
AFTER INSERT OR UPDATE OF status ON public.booking_reassignment_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_reassignment();

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
SET search_path = ''
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
  SELECT combined.event_id, combined.from_status, combined.to_status,
    combined.occurred_at, combined.actor_name
  FROM (
    SELECT event.id AS event_id, event.from_status::text AS from_status,
      event.to_status::text AS to_status, event.occurred_at,
      actor.full_name AS actor_name
    FROM public.booking_status_events event
    LEFT JOIN public.profiles actor ON actor.id = event.actor_id
    WHERE event.booking_id = p_booking_id

    UNION ALL

    SELECT -audit.id AS event_id, NULL::text AS from_status,
      CASE audit.action
        WHEN 'booking.reassignment_requested' THEN 'Sustitución solicitada: ' || coalesce(audit.details->>'reason','sin motivo')
        WHEN 'booking.reassignment_accepted' THEN 'Sustitución aceptada'
        WHEN 'booking.reassignment_rejected' THEN 'Sustitución rechazada'
        WHEN 'booking.reassignment_expired' THEN 'Solicitud de sustitución expirada'
        ELSE 'Sustitución cancelada'
      END AS to_status,
      audit.created_at AS occurred_at, actor.full_name AS actor_name
    FROM public.admin_audit_log audit
    LEFT JOIN public.profiles actor ON actor.id = audit.actor_id
    WHERE audit.target_id = p_booking_id
      AND audit.action IN (
        'booking.reassignment_requested',
        'booking.reassignment_accepted',
        'booking.reassignment_rejected',
        'booking.reassignment_expired'
      )
  ) combined
  ORDER BY combined.occurred_at ASC, combined.event_id ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_booking_timeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_booking_timeline(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_booking_reassignment_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'expired' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.admin_audit_log(actor_id, action, target_id, details)
    VALUES (
      NEW.created_by,
      'booking.reassignment_expired',
      NEW.booking_id,
      jsonb_build_object(
        'request_id', NEW.id,
        'original_pro_id', NEW.original_pro_id,
        'replacement_pro_id', NEW.replacement_pro_id,
        'expired_by', auth.uid(),
        'reason', NEW.reason
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER booking_reassignment_expiry_audit
AFTER UPDATE OF status ON public.booking_reassignment_requests
FOR EACH ROW EXECUTE FUNCTION public.audit_booking_reassignment_expiry();
REVOKE ALL ON FUNCTION public.audit_booking_reassignment_expiry() FROM PUBLIC, anon, authenticated;

-- Prevent the currently assigned professional from advancing the booking while
-- an unexpired replacement request is awaiting a decision.
CREATE OR REPLACE FUNCTION public.advance_booking(p_booking_id uuid, p_new_status public.booking_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v public.bookings%rowtype;
BEGIN
  SELECT * INTO v FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_reassignment_requests r
    WHERE r.booking_id = p_booking_id
      AND r.original_pro_id = v.pro_id
      AND r.status = 'pending'
      AND r.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'booking temporarily locked while Klipp awaits the replacement professional response';
  END IF;

  IF auth.uid() = v.pro_id THEN
    IF NOT (
      (v.status = 'scheduled' AND p_new_status = 'en_route') OR
      (v.status = 'en_route' AND p_new_status = 'arrived') OR
      (v.status = 'arrived' AND p_new_status = 'in_progress') OR
      (v.status = 'in_progress' AND p_new_status = 'completed')
    ) THEN
      RAISE EXCEPTION 'invalid transition';
    END IF;

    IF p_new_status = 'in_progress'
       AND (v.equipment_confirmed_at IS NULL OR v.equipment_confirmed_by IS DISTINCT FROM auth.uid()) THEN
      RAISE EXCEPTION 'equipment confirmation required';
    END IF;
  ELSIF auth.uid() = v.client_id THEN
    IF NOT (v.status = 'completed' AND p_new_status = 'confirmed') THEN
      RAISE EXCEPTION 'invalid transition';
    END IF;
  ELSE
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.bookings SET
    status = p_new_status,
    en_route_at = CASE WHEN p_new_status = 'en_route' THEN now() ELSE en_route_at END,
    arrived_at = CASE WHEN p_new_status = 'arrived' THEN now() ELSE arrived_at END,
    started_at = CASE WHEN p_new_status = 'in_progress' THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE completed_at END,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END
  WHERE id = p_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_booking_reassignment_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired_count integer;
BEGIN
  UPDATE public.booking_reassignment_requests
  SET status = 'expired', responded_at = now()
  WHERE status = 'pending' AND expires_at <= now();

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_booking_reassignment_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_booking_reassignment_requests() TO service_role;

DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL
     AND to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'klipp-booking-reassignment-expiry') THEN
      PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'klipp-booking-reassignment-expiry';
    END IF;
    PERFORM cron.schedule(
      'klipp-booking-reassignment-expiry',
      '* * * * *',
      'SELECT public.expire_booking_reassignment_requests();'
    );
  ELSE
    RAISE NOTICE 'pg_cron unavailable: reassignment requests are also expired lazily when a professional opens Solicitudes or an admin starts another reassignment.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_booking_reassignment_candidates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_create_booking_reassignment(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pro_list_pending_booking_reassignments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pro_list_pending_reassignment_locks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pro_respond_booking_reassignment(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_booking_reassignment_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_booking_reassignment(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_list_pending_booking_reassignments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_list_pending_reassignment_locks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_respond_booking_reassignment(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.notify_booking_reassignment() FROM PUBLIC, anon, authenticated;
