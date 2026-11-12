DROP FUNCTION IF EXISTS public.admin_resolve_azul_reconciliation(uuid,text,text,text);

CREATE OR REPLACE FUNCTION public.admin_resolve_azul_reconciliation(
  p_payment_id uuid,
  p_action text,
  p_provider_reference text,
  p_reason text,
  p_provider_amount_dop numeric DEFAULT NULL
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
  IF p_payment_id IS NULL OR p_action NOT IN ('no_charge','charge_found_refund_required','refund_confirmed') THEN
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

  ELSIF p_action='charge_found_refund_required' THEN
    IF v_payment.status<>'failed'
       OR v_payment.reconciliation_required_at IS NULL
       OR v_payment.refund_required_at IS NOT NULL
       OR p_provider_amount_dop IS NULL OR p_provider_amount_dop<=0 THEN
      RAISE EXCEPTION 'enter a valid captured amount for an expired unconfirmed attempt';
    END IF;

    UPDATE public.payments
    SET status='held',
        provider_amount_dop=p_provider_amount_dop,
        refund_required_at=clock_timestamp(),
        refund_reason='AZUL report confirms a charge without a signed browser return: ' || trim(p_reason),
        reconciliation_required_at=NULL,
        reconciliation_resolved_at=clock_timestamp(),
        reconciliation_resolved_by=auth.uid(),
        reconciliation_resolution='charge_found_refund_required: ' || trim(p_reason),
        provider_ref=p_provider_reference,
        response_message='AZUL reconciliation found a charge; refund required',
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
      'provider_amount_dop',coalesce(p_provider_amount_dop,v_payment.provider_amount_dop)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_resolve_azul_reconciliation(uuid,text,text,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_azul_reconciliation(uuid,text,text,text,numeric) TO authenticated;
