-- Make the unpaid checkout expiry reconciliation message provider-neutral.
CREATE OR REPLACE FUNCTION public.expire_unpaid_booking_checkouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.payments p
  SET status = 'failed',
      reconciliation_required_at = clock_timestamp(),
      response_message = coalesce(
        response_message,
        'Checkout expired without verified payment; reconcile any late provider capture before dispatch'
      ),
      updated_at = clock_timestamp()
  FROM public.bookings b
  WHERE b.id = p.booking_id
    AND b.status = 'payment_pending'
    AND b.payment_due_at <= clock_timestamp()
    AND p.status = 'pending';

  UPDATE public.bookings
  SET status = 'expired'
  WHERE status = 'payment_pending'
    AND payment_due_at <= clock_timestamp();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_unpaid_booking_checkouts()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_booking_checkouts()
TO service_role;
