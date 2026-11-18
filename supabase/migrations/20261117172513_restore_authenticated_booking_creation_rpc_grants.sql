-- Booking creation is called by the signed-in mobile client.
-- Keep public/anonymous execution disabled.
REVOKE ALL ON FUNCTION public.create_booking_at_location(
  uuid, double precision, double precision, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_at_location(
  uuid, double precision, double precision, text, text, timestamptz
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_tier_booking_at_location(
  integer, double precision, double precision, text, text, timestamptz, public.assignment_mode, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tier_booking_at_location(
  integer, double precision, double precision, text, text, timestamptz, public.assignment_mode, uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_auto_service_booking_at_location(
  integer, double precision, double precision, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_auto_service_booking_at_location(
  integer, double precision, double precision, text, text, timestamptz
) TO authenticated;
