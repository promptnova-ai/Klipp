-- Centralize invariants for every new booking, including legacy RPCs.
-- Existing bookings are intentionally untouched.
CREATE OR REPLACE FUNCTION public.enforce_booking_creation_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_service_active boolean;
  v_end_local timestamp without time zone;
BEGIN
  SELECT service.active
  INTO v_service_active
  FROM public.service_types service
  WHERE service.id = NEW.service_type_id;

  IF NOT FOUND OR v_service_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'service is no longer available';
  END IF;

  IF NEW.scheduled_start IS NULL OR NEW.est_minutes IS NULL OR NEW.est_minutes <= 0 THEN
    RAISE EXCEPTION 'booking start and a positive service duration are required';
  END IF;

  v_end_local := (NEW.scheduled_start + make_interval(mins => NEW.est_minutes))
    AT TIME ZONE 'America/Santo_Domingo';

  IF (NEW.scheduled_start AT TIME ZONE 'America/Santo_Domingo')::date <> v_end_local::date THEN
    RAISE EXCEPTION 'service must fit within one local calendar day';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bookings_validate_creation_invariants ON public.bookings;
CREATE TRIGGER bookings_validate_creation_invariants
BEFORE INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_creation_invariants();

REVOKE ALL ON FUNCTION public.enforce_booking_creation_invariants() FROM PUBLIC, anon, authenticated;

-- The current app uses create_booking_at_location / create_tier_booking_at_location.
-- Retire the old catalog-price RPC so clients cannot bypass professional-specific
-- pricing, current service eligibility, and the newer booking validation path.
REVOKE ALL ON FUNCTION public.create_booking(
  integer, uuid, timestamp with time zone, public.assignment_mode, uuid, text
) FROM PUBLIC, anon, authenticated;
