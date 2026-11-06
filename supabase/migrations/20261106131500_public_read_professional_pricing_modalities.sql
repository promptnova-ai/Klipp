-- Professional registration reads pricing_tiers before the account is created.
-- Keep this reference catalog publicly readable, but never writable from a client.
REVOKE ALL PRIVILEGES ON TABLE public.pricing_tiers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pricing_tiers TO anon, authenticated;

DROP POLICY IF EXISTS pricing_tiers_read ON public.pricing_tiers;
CREATE POLICY pricing_tiers_public_read
ON public.pricing_tiers
FOR SELECT
TO anon, authenticated
USING (true);
