-- Customer-visible acceptance rate for the professional assigned to their own booking.
-- Counts accepted responses against all completed responses (accepted/rejected/expired).
CREATE OR REPLACE FUNCTION public.get_client_visible_pro_acceptance_rate(p_booking_id uuid)
RETURNS TABLE(acceptance_rate numeric, accepted_requests bigint, total_responses bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro_id uuid;
BEGIN
  SELECT b.pro_id INTO v_pro_id
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.client_id = auth.uid();

  IF NOT FOUND OR v_pro_id IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN count(*) = 0 THEN NULL::numeric
      ELSE round(100.0 * count(*) FILTER (WHERE br.status = 'accepted') / count(*), 1)
    END,
    count(*) FILTER (WHERE br.status = 'accepted'),
    count(*)
  FROM public.booking_requests br
  WHERE br.pro_id = v_pro_id
    AND br.status IN ('accepted', 'rejected', 'expired');
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_visible_pro_acceptance_rate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_visible_pro_acceptance_rate(uuid) TO authenticated;
