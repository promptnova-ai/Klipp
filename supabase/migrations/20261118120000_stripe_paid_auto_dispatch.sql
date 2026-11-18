-- Dispatch automatic bookings only after a payment is confirmed.
-- This is intentionally a database trigger: the mobile client may close before
-- Stripe delivers the signed webhook, so dispatch must not depend on the app.

CREATE OR REPLACE FUNCTION public.dispatch_auto_booking_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status = 'payment_pending'
     AND NEW.status = 'requested'
     AND NEW.assignment_mode = 'auto'
     AND NEW.pro_id IS NULL THEN
    PERFORM public.dispatch_auto_booking(NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.dispatch_auto_booking_after_payment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bookings_dispatch_auto_after_payment ON public.bookings;

CREATE TRIGGER bookings_dispatch_auto_after_payment
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (
  OLD.status = 'payment_pending'
  AND NEW.status = 'requested'
  AND NEW.assignment_mode = 'auto'
  AND NEW.pro_id IS NULL
)
EXECUTE FUNCTION public.dispatch_auto_booking_after_payment();
