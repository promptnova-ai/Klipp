-- Prevent expired Stripe attempts from blocking a later checkout.
CREATE OR REPLACE FUNCTION public.create_stripe_payment_attempt(
  p_booking_id uuid,
  p_idempotency_key text
)
RETURNS TABLE(payment_id uuid, amount_dop numeric, currency_code text, checkout_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_booking_id IS NULL OR p_idempotency_key IS NULL
     OR length(trim(p_idempotency_key)) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'invalid payment request';
  END IF;

  SELECT * INTO v_booking FROM public.bookings
  WHERE id=p_booking_id AND client_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status<>'payment_pending' THEN RAISE EXCEPTION 'booking is not awaiting initial payment'; END IF;
  IF v_booking.payment_due_at IS NULL OR v_booking.payment_due_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'booking payment window has expired';
  END IF;
  IF v_booking.price_dop<=1 THEN RAISE EXCEPTION 'catalog price is not configured; checkout is disabled'; END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_payment.booking_id<>p_booking_id OR v_payment.provider<>'stripe' THEN
      RAISE EXCEPTION 'idempotency key is already assigned to another payment';
    END IF;
    IF v_payment.status<>'pending' THEN
      RAISE EXCEPTION 'this payment attempt is no longer pending; create a new attempt';
    END IF;
    RETURN QUERY SELECT v_payment.id,v_payment.amount_dop,v_payment.currency_code,v_payment.checkout_expires_at;
    RETURN;
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE booking_id=p_booking_id AND status='pending'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_payment.provider='stripe'
       AND v_payment.checkout_expires_at IS NOT NULL
       AND v_payment.checkout_expires_at<=clock_timestamp() THEN
      UPDATE public.payments SET status='failed', response_code='checkout_expired',
        response_message='Stripe checkout attempt expired before confirmation',
        updated_at=clock_timestamp() WHERE id=v_payment.id;
    ELSE
      IF v_payment.provider<>'stripe' THEN
        RAISE EXCEPTION 'booking already has an active payment attempt with another provider';
      END IF;
      RETURN QUERY SELECT v_payment.id,v_payment.amount_dop,v_payment.currency_code,v_payment.checkout_expires_at;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE booking_id=p_booking_id AND status='held'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RAISE EXCEPTION 'booking already has a payment awaiting release or refund'; END IF;

  v_expires_at:=least(v_booking.payment_due_at,clock_timestamp()+interval '10 minutes');
  INSERT INTO public.payments(booking_id,provider,amount_dop,currency_code,status,idempotency_key,checkout_expires_at)
  VALUES(p_booking_id,'stripe',v_booking.price_dop,'DOP','pending',p_idempotency_key,v_expires_at)
  RETURNING * INTO v_payment;

  RETURN QUERY SELECT v_payment.id,v_payment.amount_dop,v_payment.currency_code,v_payment.checkout_expires_at;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_stripe_payment_attempt(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stripe_payment_attempt(uuid,text) TO authenticated;
