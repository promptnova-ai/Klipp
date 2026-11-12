-- Short-lived, single-use browser handoff for AZUL hosted checkout.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS checkout_session_hash text,
  ADD COLUMN IF NOT EXISTS checkout_session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_session_consumed_at timestamptz;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_checkout_session_hash_format
  CHECK (checkout_session_hash IS NULL OR checkout_session_hash ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION public.set_azul_checkout_session(
  p_payment_id uuid,
  p_session_hash text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  IF p_session_hash IS NULL OR p_session_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid checkout session hash';
  END IF;
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id=p_payment_id AND provider='azul'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment attempt is no longer pending';
  END IF;
  IF v_payment.checkout_expires_at IS NULL OR v_payment.checkout_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'payment checkout has expired';
  END IF;
  IF p_expires_at <= clock_timestamp() OR p_expires_at > v_payment.checkout_expires_at THEN
    RAISE EXCEPTION 'invalid checkout session expiry';
  END IF;

  UPDATE public.payments
  SET checkout_session_hash=p_session_hash,
      checkout_session_expires_at=p_expires_at,
      checkout_session_consumed_at=NULL,
      updated_at=clock_timestamp()
  WHERE id=p_payment_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_azul_checkout_session(
  p_payment_id uuid,
  p_session_hash text
)
RETURNS TABLE(
  payment_id uuid,
  booking_id uuid,
  provider_order_number text,
  amount_dop numeric,
  currency_code text,
  checkout_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id=p_payment_id AND provider='azul'
  FOR UPDATE;
  IF NOT FOUND OR v_payment.status <> 'pending'
     OR v_payment.checkout_session_hash IS DISTINCT FROM p_session_hash
     OR v_payment.checkout_session_expires_at IS NULL
     OR v_payment.checkout_session_expires_at <= clock_timestamp()
     OR v_payment.checkout_expires_at IS NULL
     OR v_payment.checkout_expires_at <= clock_timestamp()
     OR v_payment.checkout_session_consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'checkout session is invalid, expired, or already used';
  END IF;

  UPDATE public.payments
  SET checkout_session_consumed_at=clock_timestamp(), updated_at=clock_timestamp()
  WHERE id=p_payment_id;

  RETURN QUERY
  SELECT v_payment.id,v_payment.booking_id,v_payment.provider_order_number,
         v_payment.amount_dop,v_payment.currency_code,v_payment.checkout_expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_azul_checkout_session(uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_azul_checkout_session(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_azul_checkout_session(uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_azul_checkout_session(uuid,text) TO service_role;
