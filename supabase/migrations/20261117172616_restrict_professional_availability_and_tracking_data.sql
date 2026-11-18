-- Availability is private to its owner. The owner-management policy already
-- grants the professional all required CRUD operations; remove broad/duplicate
-- SELECT policies that expose other professionals' working hours.
DROP POLICY IF EXISTS pro_availability_read ON public.pro_availability;
DROP POLICY IF EXISTS pro_availability_read_own ON public.pro_availability;
DROP POLICY IF EXISTS pro_availability_manage ON public.pro_availability;

CREATE POLICY pro_availability_manage
ON public.pro_availability
FOR ALL
TO authenticated
USING (pro_id = (select auth.uid()))
WITH CHECK (pro_id = (select auth.uid()));

-- Klipp uses in-app contact; no client-facing RPC should reveal a phone number.
REVOKE ALL ON FUNCTION public.get_tracking_pro_phone(uuid) FROM PUBLIC, anon, authenticated;
