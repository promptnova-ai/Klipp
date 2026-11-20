-- Defense in depth for pre-acceptance booking privacy.
-- Exact client location is available to the client and only to the accepted,
-- paid professional while the service is active.

DROP POLICY IF EXISTS addresses_select_assigned_professional ON public.addresses;
CREATE POLICY addresses_select_assigned_professional
ON public.addresses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.address_id = addresses.id
      AND b.pro_id = (SELECT auth.uid())
      AND b.accepted_at IS NOT NULL
      AND b.status IN ('scheduled','en_route','arrived','in_progress')
      AND EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.booking_id = b.id
          AND p.status IN ('held','released')
      )
  )
);

DROP POLICY IF EXISTS bookings_select_participants ON public.bookings;
CREATE POLICY bookings_select_participants
ON public.bookings
FOR SELECT
TO authenticated
USING (
  client_id = (SELECT auth.uid())
  OR (
    pro_id = (SELECT auth.uid())
    AND accepted_at IS NOT NULL
    AND status IN ('scheduled','en_route','arrived','in_progress')
    AND EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.booking_id = bookings.id
        AND p.status IN ('held','released')
    )
  )
);

-- Clean existing in-app notifications and pending push rows at source.
UPDATE public.notifications
SET data = data - ARRAY[
  'addressText','landmarkNotes','clientLat','clientLng',
  'latitude','longitude','lat','lng','address','street',
  'referencesText','location','coordinates','geolocation'
]
WHERE type = 'booking_request'
  AND data ?| ARRAY[
    'addressText','landmarkNotes','clientLat','clientLng',
    'latitude','longitude','lat','lng','address','street',
    'referencesText','location','coordinates','geolocation'
  ];

CREATE OR REPLACE FUNCTION public.notify_klipp_booking_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_booking public.bookings%rowtype;
  v_client_name text;
  v_service_name text;
  v_tier_label text;
  v_title text;
  v_body text;
  v_base_price numeric(10,2);
  v_base_minutes integer;
  v_tier_price numeric(10,2);
  v_tier_minutes integer;
  v_offer_price numeric(10,2);
  v_offer_minutes integer;
  v_commission_pct numeric(5,2);
  v_payout numeric(10,2);
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.status = 'pending' THEN
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

    SELECT ps.base_price_dop, ps.est_minutes, tp.price_dop, tp.est_minutes
    INTO v_base_price, v_base_minutes, v_tier_price, v_tier_minutes
    FROM public.pro_services ps
    LEFT JOIN public.pro_service_tier_prices tp
      ON tp.pro_service_id = ps.id
     AND tp.pricing_tier_id = v_booking.pricing_tier_id
     AND tp.active
    WHERE ps.pro_id = NEW.pro_id
      AND ps.service_type_id = v_booking.service_type_id
      AND ps.active
    LIMIT 1;

    IF v_booking.pricing_tier_id IS NOT NULL THEN
      v_offer_price := coalesce(v_tier_price, v_booking.price_dop);
      v_offer_minutes := coalesce(v_tier_minutes, v_booking.est_minutes);
    ELSE
      v_offer_price := coalesce(v_base_price, v_booking.price_dop);
      v_offer_minutes := coalesce(v_base_minutes, v_booking.est_minutes);
    END IF;

    v_commission_pct := coalesce(v_booking.commission_pct, 7.00);
    v_payout := v_offer_price - round(v_offer_price * v_commission_pct / 100, 2);

    v_title := 'Nueva solicitud de servicio';
    v_body := coalesce(v_client_name, 'Un cliente') || ' solicita ' ||
      coalesce(v_service_name, 'un servicio Klipp') ||
      CASE WHEN v_tier_label IS NOT NULL THEN ' · ' || v_tier_label ELSE '' END ||
      ' · Recibirías ' || to_char(v_payout, 'FM999G999G990D00') ||
      ' DOP. Toca para revisar y aceptar.';

    -- Deliberately omit all address, landmark and coordinate fields.
    PERFORM public.create_klipp_notification(
      NEW.pro_id,
      NEW.booking_id,
      'booking_request',
      v_title,
      v_body,
      jsonb_build_object(
        'bookingId', NEW.booking_id,
        'requestId', NEW.id,
        'target', 'pro',
        'clientName', coalesce(v_client_name, 'Cliente Klipp'),
        'serviceName', coalesce(v_service_name, 'Servicio Klipp'),
        'pricingTierLabel', v_tier_label,
        'scheduledStart', v_booking.scheduled_start,
        'estimatedMinutes', v_offer_minutes,
        'offerPriceDop', v_offer_price,
        'professionalPayoutDop', v_payout
      ),
      'booking-request:' || NEW.id::text || ':pending',
      'booking_updates'
    );
  ELSIF NEW.status IN ('rejected', 'expired')
    AND v_booking.assignment_mode = 'manual' THEN
    PERFORM public.create_klipp_notification(
      v_booking.client_id,
      NEW.booking_id,
      'booking_request_update',
      CASE WHEN NEW.status = 'rejected'
        THEN 'El profesional no puede aceptar el servicio'
        ELSE 'La solicitud ha expirado'
      END,
      CASE WHEN NEW.status = 'rejected'
        THEN 'El profesional seleccionado no está disponible. Puedes elegir otro profesional o buscar una alternativa.'
        ELSE 'El profesional no respondió a tiempo. Puedes volver a intentarlo con otro profesional.'
      END,
      jsonb_build_object(
        'bookingId', NEW.booking_id,
        'requestId', NEW.id,
        'target', 'client',
        'requestStatus', NEW.status
      ),
      'booking-request:' || NEW.id::text || ':' || NEW.status::text || ':client',
      'booking_updates'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Release a manually selected professional after decline/expiry. The booking
-- remains requested for the client to choose another professional. This trigger
-- is a second enforcement layer even if an RPC implementation regresses.
CREATE OR REPLACE FUNCTION public.release_manual_booking_offer_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status = 'pending'
     AND NEW.status IN ('rejected','expired') THEN
    UPDATE public.bookings
    SET pro_id = NULL,
        pro_service_id = NULL
    WHERE id = NEW.booking_id
      AND assignment_mode = 'manual'
      AND status = 'requested'
      AND pro_id = NEW.pro_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS booking_requests_release_manual_assignment
ON public.booking_requests;
CREATE TRIGGER booking_requests_release_manual_assignment
AFTER UPDATE OF status ON public.booking_requests
FOR EACH ROW
WHEN (OLD.status = 'pending' AND NEW.status IN ('rejected','expired'))
EXECUTE FUNCTION public.release_manual_booking_offer_assignment();

REVOKE ALL ON FUNCTION public.release_manual_booking_offer_assignment()
FROM PUBLIC, anon, authenticated;
