-- Tighten prepaid booking RPC grants and professional verification document storage.
-- Booking creation must be authenticated; these functions validate auth.uid().
REVOKE ALL ON FUNCTION public.create_prepaid_booking_at_location(
  uuid, double precision, double precision, text, text, timestamptz, numeric, integer, public.assignment_mode
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_prepaid_booking_at_location(
  uuid, double precision, double precision, text, text, timestamptz, numeric, integer, public.assignment_mode
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_prepaid_tier_booking_at_location(
  integer, double precision, double precision, text, text, timestamptz, public.assignment_mode, uuid, numeric, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_prepaid_tier_booking_at_location(
  integer, double precision, double precision, text, text, timestamptz, public.assignment_mode, uuid, numeric, integer
) TO authenticated;

-- The app uploads with upsert=false; users must not replace evidence in place.
DROP POLICY IF EXISTS pro_verification_documents_update ON storage.objects;

-- Permit failed/pending upload cleanup, but preserve documents after approval.
DROP POLICY IF EXISTS pro_verification_documents_delete ON storage.objects;
CREATE POLICY pro_verification_documents_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'pro-verification-documents'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.pro_profiles
    WHERE pro_profiles.user_id = auth.uid()
      AND pro_profiles.verification_status <> 'approved'
  )
);
