-- Discovery and slot RPCs are only used after client authentication.
-- Do not expose professional availability/location discovery to anonymous callers.
REVOKE EXECUTE ON FUNCTION public.get_available_booking_slots_at_location(integer,double precision,double precision,date,public.assignment_mode,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_booking_slots_at_location(integer,double precision,double precision,date,public.assignment_mode,uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_available_pros_at_location(double precision,double precision,timestamp with time zone,integer,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_available_pros_at_location(double precision,double precision,timestamp with time zone,integer,integer,integer) TO authenticated;
