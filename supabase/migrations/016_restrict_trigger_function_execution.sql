-- Restrict trigger-only SECURITY DEFINER routines from the exposed PostgREST API.
-- These functions are attached to database triggers; PostgreSQL does not
-- require the invoking API role to have EXECUTE on a trigger function.
-- Keep execution available to trusted database owners/service operations.
REVOKE EXECUTE ON FUNCTION public.apply_booking_commission() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_booking_request_expiry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_jobs_completed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_pro_location_after_trip() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_pro_rating() FROM PUBLIC, anon, authenticated;
