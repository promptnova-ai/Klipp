-- Admin-visible queue for browser-return gaps and AZUL-approved charges
-- that require a confirmed refund. Staff permissions are checked server-side.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_resolved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reconciliation_resolution text;

CREATE OR REPLACE FUNCTION public.admin_list_azul_reconciliation()
RETURNS TABLE(
  payment_id uuid,
  booking_id uuid,
  client_name text,
  booking_status text,
  provider_order_number text,
  expected_amount_dop numeric,
  provider_amount_dop numeric,
  payment_status text,
  reconciliation_required_at timestamptz,
  refund_required_at timestamptz,
  refund_reason text,
  response_message text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('finance.read') THEN
    RAISE EXCEPTION 'permission denied: finance.read';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.booking_id,
    client.full_name,
    b.status::text,
    p.provider_order_number,
    p.amount_dop,
    p.provider_amount_dop,
    p.status::text,
    p.reconciliation_required_at,
    p.refund_required_at,
    p.refund_reason,
    p.response_message,
    p.created_at
  FROM public.payments p
  JOIN public.bookings b ON b.id=p.booking_id
  LEFT JOIN public.profiles client ON client.id=b.client_id
  WHERE p.provider='azul'
    AND (p.reconciliation_required_at IS NOT NULL OR p.refund_required_at IS NOT NULL)
  ORDER BY coalesce(p.refund_required_at,p.reconciliation_required_at),p.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_azul_reconciliation(
  p_payment_id uuid,
  p_action text,
  p_provider_reference text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_admin_permission('finance.reconcile') THEN
    RAISE EXCEPTION 'permission denied: finance.reconcile';
  END IF;
  IF p_payment_id IS NULL OR p_action NOT IN ('no_charge','refund_confirmed') THEN
    RAISE EXCEPTION 'invalid reconciliation action';
  END IF;
  IF p_provider_reference IS NULL OR length(trim(p_provider_reference)) NOT BETWEEN 4 AND 120 THEN
    RAISE EXCEPTION 'enter a valid AZUL report or refund reference';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'enter a reconciliation reason between 5 and 500 characters';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id=p_payment_id AND provider='azul'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AZUL payment not found'; END IF;

  IF p_action='no_charge' THEN
    IF v_payment.status<>'failed'
       OR v_payment.reconciliation_required_at IS NULL
       OR v_payment.refund_required_at IS NOT NULL THEN
      RAISE EXCEPTION 'only an expired unconfirmed attempt can be reconciled as no charge';
    END IF;

    UPDATE public.payments
    SET reconciliation_required_at=NULL,
        reconciliation_resolved_at=clock_timestamp(),
        reconciliation_resolved_by=auth.uid(),
        reconciliation_resolution='no_charge: ' || trim(p_reason),
        provider_ref=p_provider_reference,
        response_message='AZUL reconciliation confirmed no charge',
        updated_at=clock_timestamp()
    WHERE id=v_payment.id;
  ELSE
    IF v_payment.status<>'held' OR v_payment.refund_required_at IS NULL THEN
      RAISE EXCEPTION 'only an AZUL-approved payment awaiting refund can be marked refunded';
    END IF;

    UPDATE public.payments
    SET status='refunded',
        refunded_at=clock_timestamp(),
        provider_refund_id=p_provider_reference,
        refund_required_at=NULL,
        reconciliation_resolved_at=clock_timestamp(),
        reconciliation_resolved_by=auth.uid(),
        reconciliation_resolution='refund_confirmed: ' || trim(p_reason),
        response_message='AZUL refund confirmed by finance operator',
        updated_at=clock_timestamp()
    WHERE id=v_payment.id;
  END IF;

  INSERT INTO public.admin_audit_log(actor_id,action,target_id,details)
  VALUES(
    auth.uid(),
    'payment.azul_reconciliation_resolved',
    v_payment.booking_id,
    jsonb_build_object(
      'payment_id',v_payment.id,
      'action',p_action,
      'provider_reference',trim(p_provider_reference),
      'reason',trim(p_reason),
      'expected_amount_dop',v_payment.amount_dop,
      'provider_amount_dop',v_payment.provider_amount_dop
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_azul_reconciliation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_azul_reconciliation(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_azul_reconciliation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_azul_reconciliation(uuid,text,text,text) TO authenticated;
