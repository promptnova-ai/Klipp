-- The current Expo client uses booking_requests, not the legacy booking_offers table.
-- Keep the legacy professional response path functional, but remove broad table access:
-- clients cannot create/delete offers or modify booking/price/recipient fields.
DO $migration$
BEGIN
  IF to_regclass('public.booking_offers') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.booking_offers FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.booking_offers TO authenticated';
    EXECUTE 'GRANT UPDATE (status) ON TABLE public.booking_offers TO authenticated';

    EXECUTE 'DROP POLICY IF EXISTS "Clientes ven ofertas de sus reservas" ON public.booking_offers';
    EXECUTE 'DROP POLICY IF EXISTS "Profesionales ven sus ofertas" ON public.booking_offers';
    EXECUTE 'DROP POLICY IF EXISTS "Profesionales pueden responder sus ofertas" ON public.booking_offers';
    EXECUTE 'DROP POLICY IF EXISTS booking_offers_read_participants ON public.booking_offers';
    EXECUTE 'DROP POLICY IF EXISTS booking_offers_professional_respond ON public.booking_offers';

    EXECUTE $policy$
      CREATE POLICY booking_offers_read_participants
      ON public.booking_offers
      FOR SELECT
      TO authenticated
      USING (
        professional_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.id = booking_offers.booking_id
            AND b.client_id = (SELECT auth.uid())
        )
      )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY booking_offers_professional_respond
      ON public.booking_offers
      FOR UPDATE
      TO authenticated
      USING (
        professional_id = (SELECT auth.uid())
        AND status = 'pending'
        AND expires_at > now()
      )
      WITH CHECK (
        professional_id = (SELECT auth.uid())
        AND status IN ('accepted', 'rejected')
      )
    $policy$;
  END IF;
END;
$migration$;
