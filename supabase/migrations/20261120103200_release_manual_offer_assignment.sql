-- Manual offer rejection/expiry releases the selected professional while
-- retaining the original pro_service_id as the immutable quote source.
-- This satisfies bookings_service_source_check and keeps quote auditability.

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
    SET pro_id = NULL
    WHERE id = NEW.booking_id
      AND assignment_mode = 'manual'
      AND status = 'requested'
      AND pro_id = NEW.pro_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.release_manual_booking_offer_assignment()
FROM PUBLIC, anon, authenticated;
