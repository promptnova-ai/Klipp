-- Trusted backend operations for the prepaid AZUL lifecycle.
-- These RPCs are not callable by anon/authenticated clients directly.

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

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'payment_pending' THEN
    RAISE EXCEPTION 'booking is not awaiting initial payment';
  END IF;
  IF v_booking.payment_due_at IS NULL OR v_booking.payment_due_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'booking payment window has expired';
  END IF;
  IF v_booking.price_dop <= 0 THEN RAISE EXCEPTION 'booking price is invalid'; END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_payment.booking_id <> p_booking_id THEN
      RAISE EXCEPTION 'idempotency key already belongs to another booking';
    END IF;
    RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code,
      v_payment.provider_order_number, v_payment.checkout_expires_at;
    RETURN;
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE booking_id = p_booking_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code,
      v_payment.provider_order_number, v_payment.checkout_expires_at;
    RETURN;
  END IF;

  v_expires_at := least(v_booking.payment_due_at, clock_timestamp() + interval '10 minutes');

  INSERT INTO public.payments (
    booking_id, provider, provider_order_number, amount_dop, currency_code,
    status, idempotency_key, checkout_expires_at
  )
  VALUES (
    p_booking_id, 'azul', p_provider_order_number, v_booking.price_dop, 'DOP',
    'pending', p_idempotency_key, v_expires_at
  )
  RETURNING * INTO v_payment;

  RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code,
    v_payment.provider_order_number, v_payment.checkout_expires_at;
END;
$$;

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
AS $$
DECLARE
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
BEGIN
  IF p_auth_hash_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'AZUL response signature has not been verified';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id AND provider = 'azul'
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'payment attempt not found'; END IF;

  -- Duplicate callbacks are idempotent only when all transaction identity
  -- fields still match the already finalized attempt.
  IF v_payment.status = 'held' THEN
    IF v_payment.provider_order_number = p_provider_order_number
       AND v_payment.amount_dop = p_amount_dop
       AND v_payment.response_code = p_response_code THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'conflicting callback for an already approved payment';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment attempt is no longer pending';
  END IF;
  IF v_payment.provider_order_number IS DISTINCT FROM p_provider_order_number THEN
    RAISE EXCEPTION 'provider order number mismatch';
  END IF;
  IF v_payment.amount_dop IS DISTINCT FROM p_amount_dop THEN
    RAISE EXCEPTION 'payment amount mismatch';
  END IF;
  IF v_payment.currency_code <> 'DOP' THEN
    RAISE EXCEPTION 'payment currency mismatch';
  END IF;
  IF v_payment.checkout_expires_at IS NULL OR v_payment.checkout_expires_at <= clock_timestamp() THEN
    UPDATE public.payments
    SET status = 'failed', response_code = p_response_code,
        response_message = 'Checkout attempt expired', updated_at = clock_timestamp()
    WHERE id = v_payment.id;
    RETURN false;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_payment.booking_id
  FOR UPDATE;

  IF NOT FOUND OR v_booking.status <> 'payment_pending'
     OR v_booking.payment_due_at IS NULL
     OR v_booking.payment_due_at <= clock_timestamp() THEN
    UPDATE public.payments
    SET status = 'failed', response_code = p_response_code,
        response_message = 'Booking payment window expired', updated_at = clock_timestamp()
    WHERE id = v_payment.id;
    RETURN false;
  END IF;

  IF p_response_code <> '00' THEN
    UPDATE public.payments
    SET status = 'failed', response_code = p_response_code,
        authorization_code = p_authorization_code, rrn = p_rrn,
        auth_hash_verified_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = v_payment.id;
    RETURN false;
  END IF;

  UPDATE public.payments
  SET status = 'held', held_at = clock_timestamp(),
      response_code = p_response_code,
      authorization_code = p_authorization_code,
      rrn = p_rrn,
      auth_hash_verified_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = v_payment.id;

  UPDATE public.bookings
  SET status = 'requested',
      price_locked_at = coalesce(price_locked_at, clock_timestamp())
  WHERE id = v_booking.id
    AND status = 'payment_pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'booking could not be activated after payment'; END IF;

  -- A manually selected professional receives an offer only after payment.
  IF v_booking.assignment_mode = 'manual' AND v_booking.pro_id IS NOT NULL THEN
    INSERT INTO public.booking_requests (booking_id, pro_id, expires_at)
    VALUES (v_booking.id, v_booking.pro_id, clock_timestamp() + interval '45 seconds')
    ON CONFLICT (booking_id, pro_id) DO UPDATE
      SET status = 'pending',
          created_at = clock_timestamp(),
          expires_at = clock_timestamp() + interval '45 seconds',
          responded_at = NULL;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_unpaid_booking_checkouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.payments p
  SET status = 'failed',
      response_message = coalesce(response_message, 'Checkout expired without verified payment'),
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
$$;

REVOKE ALL ON FUNCTION public.create_booking_payment_attempt(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_azul_payment_attempt(uuid, text, numeric, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_unpaid_booking_checkouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_payment_attempt(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_azul_payment_attempt(uuid, text, numeric, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_booking_checkouts() TO service_role;

COMMENT ON FUNCTION public.finalize_azul_payment_attempt(uuid, text, numeric, text, text, text, boolean) IS
  'Service-role only. Call only after the AZUL AuthHash and transaction fields have been verified by the trusted callback Edge Function.';
