-- Late Stripe success events must still be linkable to the original payment row.
-- process_stripe_webhook_event() then classifies expired captures as refund_required
-- and never activates dispatch. Do not reject the event before reconciliation.

CREATE OR REPLACE FUNCTION public.attach_stripe_payment_intent(
  p_payment_id uuid,
  p_payment_intent_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  IF p_payment_id IS NULL
     OR p_payment_intent_id IS NULL
     OR p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'invalid Stripe payment intent reference';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id AND provider = 'stripe'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe payment attempt not found';
  END IF;

  IF v_payment.status NOT IN ('pending','held','failed') THEN
    RAISE EXCEPTION 'Stripe payment attempt cannot be linked in its current state';
  END IF;

  IF v_payment.provider_ref IS NOT NULL
     AND v_payment.provider_ref <> p_payment_intent_id THEN
    RAISE EXCEPTION 'payment attempt already has a different Stripe intent';
  END IF;

  UPDATE public.payments
  SET provider_ref = p_payment_intent_id,
      updated_at = clock_timestamp()
  WHERE id = p_payment_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_stripe_payment_intent(uuid,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_stripe_payment_intent(uuid,text)
TO service_role;
