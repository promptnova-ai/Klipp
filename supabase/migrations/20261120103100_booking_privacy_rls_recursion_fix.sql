-- Avoid recursive RLS evaluation while keeping payment confirmation
-- as a server-side prerequisite for professional access to booking details.

CREATE OR REPLACE FUNCTION public.pro_can_access_paid_booking(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.payments p ON p.booking_id = b.id
      WHERE b.id = p_booking_id
        AND b.pro_id = auth.uid()
        AND b.accepted_at IS NOT NULL
        AND b.status IN ('scheduled','en_route','arrived','in_progress')
        AND p.status IN ('held','released')
    ),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.pro_can_access_paid_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_can_access_paid_booking(uuid) TO authenticated;

DROP POLICY IF EXISTS bookings_select_participants ON public.bookings;
CREATE POLICY bookings_select_participants
ON public.bookings
FOR SELECT
TO authenticated
USING (
  client_id = (SELECT auth.uid())
  OR public.pro_can_access_paid_booking(id)
);

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
      AND public.pro_can_access_paid_booking(b.id)
  )
);
