-- A signed AZUL approval is money movement even if it arrives late or with
-- an unexpected amount. Record it and require refund reconciliation; never
-- silently mark a real approval as failed or dispatch it at a mismatched price.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider_amount_dop numeric(10,2),
  ADD COLUMN IF NOT EXISTS refund_required_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text;

CREATE OR REPLACE FUNCTION public.finalize_azul_payment_attempt(
  p_payment_id uuid,
  p_provider_order_number text,
  p_amount_dop numeric,
  p_response_code text,
  p_authorization_code text DEFAULT NULL,
  p_rrn text DEFAULT NULL,
  p_auth_hash_verified boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_refund_reason text;
BEGIN
  IF p_auth_hash_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'AZUL response signature has not been verified';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id=p_payment_id AND provider='azul'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment attempt not found'; END IF;

  IF v_payment.status='held' THEN
    IF v_payment.provider_order_number=p_provider_order_number
       AND v_payment.provider_amount_dop IS NOT DISTINCT FROM p_amount_dop
       AND v_payment.response_code=p_response_code THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'conflicting callback for an already approved payment';
  END IF;
  IF v_payment.status<>'pending' THEN RAISE EXCEPTION 'payment attempt is no longer pending'; END IF;
  IF v_payment.provider_order_number IS DISTINCT FROM p_provider_order_number THEN
    RAISE EXCEPTION 'provider order number mismatch';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id=v_payment.booking_id
  FOR UPDATE;

  IF coalesce(p_response_code,'') <> '00' THEN
    UPDATE public.payments
    SET status='failed',
        provider_amount_dop=p_amount_dop,
        response_code=p_response_code,
        authorization_code=p_authorization_code,
        rrn=p_rrn,
        auth_hash_verified_at=clock_timestamp(),
        updated_at=clock_timestamp()
    WHERE id=v_payment.id;

    IF FOUND AND v_booking.id IS NOT NULL
       AND v_booking.status='payment_pending'
       AND v_booking.payment_due_at <= clock_timestamp() THEN
      UPDATE public.bookings SET status='expired' WHERE id=v_booking.id;
    END IF;
    RETURN false;
  END IF;

  -- A signed approval with a wrong amount/currency, late checkout, or a
  -- booking that is no longer payable must be recorded as received funds and
  -- queued for refund review. It must never activate dispatch.
  IF p_amount_dop IS DISTINCT FROM v_payment.amount_dop THEN
    v_refund_reason := 'AZUL approved an amount different from the customer-approved booking price';
  ELSIF v_payment.currency_code <> 'DOP' THEN
    v_refund_reason := 'AZUL payment currency does not match the booking currency';
  ELSIF v_payment.checkout_expires_at IS NULL OR v_payment.checkout_expires_at <= clock_timestamp() THEN
    v_refund_reason := 'AZUL approval arrived after the checkout attempt expired';
  ELSIF v_booking.id IS NULL OR v_booking.status <> 'payment_pending'
     OR v_booking.payment_due_at IS NULL OR v_booking.payment_due_at <= clock_timestamp() THEN
    v_refund_reason := 'AZUL approval arrived after the booking payment window or booking state expired';
  END IF;

  IF v_refund_reason IS NOT NULL THEN
    UPDATE public.payments
    SET status='held',
        held_at=clock_timestamp(),
        provider_amount_dop=p_amount_dop,
        response_code=p_response_code,
        authorization_code=p_authorization_code,
        rrn=p_rrn,
        auth_hash_verified_at=clock_timestamp(),
        refund_required_at=clock_timestamp(),
        refund_reason=v_refund_reason,
        response_message='Approved by AZUL; refund reconciliation required',
        updated_at=clock_timestamp()
    WHERE id=v_payment.id;

    IF v_booking.id IS NOT NULL AND v_booking.status='payment_pending' THEN
      UPDATE public.bookings SET status='expired' WHERE id=v_booking.id;
    END IF;
    RETURN false;
  END IF;

  UPDATE public.payments
  SET status='held',
      held_at=clock_timestamp(),
      provider_amount_dop=p_amount_dop,
      response_code=p_response_code,
      authorization_code=p_authorization_code,
      rrn=p_rrn,
      auth_hash_verified_at=clock_timestamp(),
      refund_required_at=NULL,
      refund_reason=NULL,
      updated_at=clock_timestamp()
  WHERE id=v_payment.id;

  UPDATE public.bookings
  SET status='requested',
      price_locked_at=coalesce(price_locked_at,clock_timestamp())
  WHERE id=v_booking.id AND status='payment_pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'booking could not be activated after payment'; END IF;

  IF v_booking.pro_id IS NOT NULL THEN
    INSERT INTO public.booking_requests(booking_id,pro_id,expires_at)
    VALUES(v_booking.id,v_booking.pro_id,clock_timestamp()+interval '45 seconds')
    ON CONFLICT(booking_id,pro_id) DO UPDATE
      SET status='pending',created_at=clock_timestamp(),
          expires_at=clock_timestamp()+interval '45 seconds',responded_at=NULL;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_azul_payment_attempt(uuid,text,numeric,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_azul_payment_attempt(uuid,text,numeric,text,text,text,boolean) TO service_role;
