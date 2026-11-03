-- Phase 6: Uber-style incoming service offer details.
-- Expose only the minimum client identity and booking details to the assigned
-- professional, and only while their own offer is pending and unexpired.

CREATE OR REPLACE FUNCTION public.pro_list_incoming_booking_requests()
RETURNS TABLE (
  id uuid,
  booking_id uuid,
  pro_id uuid,
  status public.request_status,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  client_name text,
  client_avatar_url text,
  service_name text,
  pricing_tier_label text,
  scheduled_start timestamptz,
  est_minutes integer,
  pro_payout_dop numeric,
  address_text text,
  landmark_notes text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    br.id,
    br.booking_id,
    br.pro_id,
    br.status,
    br.created_at,
    br.expires_at,
    br.responded_at,
    coalesce(nullif(trim(client.full_name), ''), 'Cliente Klipp'),
    client.avatar_url,
    service.name,
    tier.label,
    booking.scheduled_start,
    booking.est_minutes,
    booking.pro_payout_dop,
    booking.address_text,
    booking.landmark_notes
  FROM public.booking_requests br
  JOIN public.bookings booking ON booking.id = br.booking_id
  JOIN public.profiles client ON client.id = booking.client_id
  JOIN public.service_types service ON service.id = booking.service_type_id
  LEFT JOIN public.pricing_tiers tier ON tier.id = booking.pricing_tier_id
  WHERE br.pro_id = auth.uid()
    AND br.status = 'pending'
    AND br.expires_at > now()
  ORDER BY br.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.pro_list_incoming_booking_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_list_incoming_booking_requests() TO authenticated;

-- Enrich the existing push + in-app notification. The UI obtains the same
-- details through the permission-checked RPC above.
CREATE OR REPLACE FUNCTION public.notify_klipp_booking_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_client_name text;
  v_service_name text;
  v_tier_label text;
  v_title text;
  v_body text;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = new.booking_id;

  IF NOT FOUND THEN RETURN new; END IF;

  IF new.status = 'pending' THEN
    SELECT coalesce(nullif(trim(full_name), ''), 'Cliente Klipp')
      INTO v_client_name
    FROM public.profiles
    WHERE id = v_booking.client_id;

    SELECT name INTO v_service_name
    FROM public.service_types
    WHERE id = v_booking.service_type_id;

    SELECT label INTO v_tier_label
    FROM public.pricing_tiers
    WHERE id = v_booking.pricing_tier_id;

    v_title := '🚨 Nueva solicitud de servicio';
    v_body := coalesce(v_client_name, 'Un cliente') || ' solicita ' ||
      coalesce(v_service_name, 'un servicio Klipp') ||
      CASE WHEN v_tier_label IS NOT NULL THEN ' · ' || v_tier_label ELSE '' END ||
      ' · Recibirías ' || to_char(v_booking.pro_payout_dop, 'FM999G999G990D00') || ' DOP. Toca para revisar y aceptar.';

    PERFORM public.create_klipp_notification(
      new.pro_id,
      new.booking_id,
      'booking_request',
      v_title,
      v_body,
      jsonb_build_object(
        'bookingId', new.booking_id,
        'requestId', new.id,
        'target', 'pro',
        'clientName', coalesce(v_client_name, 'Cliente Klipp'),
        'serviceName', coalesce(v_service_name, 'Servicio Klipp'),
        'pricingTierLabel', v_tier_label,
        'scheduledStart', v_booking.scheduled_start,
        'estimatedMinutes', v_booking.est_minutes,
        'professionalPayoutDop', v_booking.pro_payout_dop,
        'addressText', v_booking.address_text,
        'landmarkNotes', v_booking.landmark_notes
      ),
      'booking-request:' || new.id::text || ':pending',
      'booking_updates'
    );
  ELSIF new.status IN ('rejected', 'expired') AND v_booking.assignment_mode = 'manual' THEN
    PERFORM public.create_klipp_notification(
      v_booking.client_id,
      new.booking_id,
      'booking_request_update',
      CASE WHEN new.status = 'rejected' THEN 'El profesional no puede aceptar el servicio' ELSE 'La solicitud ha expirado' END,
      CASE WHEN new.status = 'rejected'
        THEN 'El profesional seleccionado no está disponible. Puedes elegir otro profesional o buscar una alternativa.'
        ELSE 'El profesional no respondió a tiempo. Puedes volver a intentarlo con otro profesional.'
      END,
      jsonb_build_object('bookingId', new.booking_id, 'requestId', new.id, 'target', 'client', 'requestStatus', new.status),
      'booking-request:' || new.id::text || ':' || new.status::text || ':client',
      'booking_updates'
    );
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_klipp_booking_request() FROM PUBLIC, anon, authenticated;
