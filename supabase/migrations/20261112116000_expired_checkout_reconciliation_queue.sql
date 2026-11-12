-- If the browser closes before AZUL redirects back, the merchant may have
-- processed a charge without Klipp receiving the signed result. Mark expired
-- attempts for reconciliation instead of assuming no money moved.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS reconciliation_required_at timestamptz;

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
  SET status='failed',
      reconciliation_required_at=clock_timestamp(),
      response_message=coalesce(response_message,'Checkout expired without verified payment; reconcile against AZUL'),
      updated_at=clock_timestamp()
  FROM public.bookings b
  WHERE b.id=p.booking_id
    AND b.status='payment_pending'
    AND b.payment_due_at<=clock_timestamp()
    AND p.status='pending';

  UPDATE public.bookings
  SET status='expired'
  WHERE status='payment_pending'
    AND payment_due_at<=clock_timestamp();
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END;
$function$;

DO $migration$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.finalize_azul_payment_attempt(uuid,text,numeric,text,text,text,boolean)'::regprocedure);

  v_definition := replace(
    v_definition,
    'AND coalesce(p_response_code,'''')=''00'' THEN NULL;',
    'THEN NULL;'
  );

  v_definition := replace(
    v_definition,
    'auth_hash_verified_at=clock_timestamp(),updated_at=clock_timestamp()',
    'auth_hash_verified_at=clock_timestamp(),reconciliation_required_at=NULL,updated_at=clock_timestamp()'
  );

  v_definition := replace(
    v_definition,
    'refund_reason=v_refund_reason,response_message=''Approved by AZUL; refund reconciliation required'',updated_at=clock_timestamp()',
    'refund_reason=v_refund_reason,response_message=''Approved by AZUL; refund reconciliation required'',reconciliation_required_at=NULL,updated_at=clock_timestamp()'
  );

  v_definition := replace(
    v_definition,
    'refund_required_at=NULL,refund_reason=NULL,updated_at=clock_timestamp()',
    'refund_required_at=NULL,refund_reason=NULL,reconciliation_required_at=NULL,updated_at=clock_timestamp()'
  );

  EXECUTE v_definition;
END;
$migration$;
