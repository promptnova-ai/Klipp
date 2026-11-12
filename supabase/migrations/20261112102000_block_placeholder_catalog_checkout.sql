-- Do not let placeholder catalog values (DOP 1) enter checkout.
CREATE OR REPLACE FUNCTION public.create_booking_payment_attempt(
  p_booking_id uuid,
  p_provider_order_number text,
  p_idempotency_key text
)
RETURNS TABLE(payment_id uuid, amount_dop numeric, currency_code text, provider_order_number text, checkout_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_expires_at timestamptz;
BEGIN
  IF p_provider_order_number IS NULL OR length(trim(p_provider_order_number)) NOT BETWEEN 8 AND 64 THEN
    RAISE EXCEPTION 'invalid provider order number';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 16 AND 128 THEN
    RAISE EXCEPTION 'invalid idempotency key';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'payment_pending' THEN RAISE EXCEPTION 'booking is not awaiting initial payment'; END IF;
  IF v_booking.payment_due_at IS NULL OR v_booking.payment_due_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'booking payment window has expired';
  END IF;
  IF v_booking.price_dop IS NULL OR v_booking.price_dop <= 0 THEN
    RAISE EXCEPTION 'professional quote is missing or invalid; checkout is disabled';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_payment.booking_id <> p_booking_id THEN RAISE EXCEPTION 'idempotency key already belongs to another booking'; END IF;
    RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code, v_payment.provider_order_number, v_payment.checkout_expires_at;
    RETURN;
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE booking_id = p_booking_id AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code, v_payment.provider_order_number, v_payment.checkout_expires_at;
    RETURN;
  END IF;

  v_expires_at := least(v_booking.payment_due_at, clock_timestamp() + interval '10 minutes');
  INSERT INTO public.payments(booking_id,provider,provider_order_number,amount_dop,currency_code,status,idempotency_key,checkout_expires_at)
  VALUES(p_booking_id,'azul',p_provider_order_number,v_booking.price_dop,'DOP','pending',p_idempotency_key,v_expires_at)
  RETURNING * INTO v_payment;
  RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code, v_payment.provider_order_number, v_payment.checkout_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_payment_attempt(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_payment_attempt(uuid,text,text) TO service_role;
