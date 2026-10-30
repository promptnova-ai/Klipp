-- Klipp: lock down direct writes to bookings, booking_requests and reviews.
-- User-facing writes must go through validated RPCs. Edge Functions continue
-- to use service_role, which is intentionally not modified here.

-- Remove broad privileges (including historical grants) from public API roles.
revoke all privileges on table public.bookings
  from PUBLIC, anon, authenticated;
revoke all privileges on table public.booking_requests
  from PUBLIC, anon, authenticated;
revoke all privileges on table public.reviews
  from PUBLIC, anon, authenticated;

-- Authenticated users may read only rows allowed by the existing RLS policies.
grant select on table public.bookings to authenticated;
grant select on table public.booking_requests to authenticated;
grant select on table public.reviews to authenticated;

-- The mobile app creates a review directly; the existing INSERT RLS policy
-- enforces that it belongs to the client and to a completed/confirmed booking.
grant insert on table public.reviews to authenticated;

-- No direct INSERT/UPDATE/DELETE on bookings or booking_requests.
-- No direct UPDATE/DELETE on reviews.
-- SECURITY DEFINER RPCs and service_role Edge Functions retain their ability
-- to perform the validated business operations.
