-- Stripe payment foundation for Klipp QA.
-- No Stripe secrets, live charges, or automated payouts are configured here.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payment_intent_id text,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed')),
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  last_error text,
  CONSTRAINT stripe_webhook_event_id_format
    CHECK (event_id ~ '^evt_[A-Za-z0-9]+$')
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_payment_intent_idx
  ON public.stripe_webhook_events(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stripe_webhook_events TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_provider_ref_uidx
  ON public.payments(provider, provider_ref)
  WHERE provider = 'stripe' AND provider_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_stripe_payment_attempt(
  p_booking_id uuid,
  p_idempotency_key text
)
RETURNS TABLE (
  payment_id uuid,
  amount_dop numeric,
  currency_code text,
  checkout_expires_at timestamptz
)
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
  WHERE id = p_booking_id AND client_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking not found'; END IF;
  IF v_booking.status <> 'payment_pending' THEN
    RAISE EXCEPTION 'booking is not awaiting initial payment';
  END IF;
  IF v_booking.payment_due_at IS NULL OR v_booking.payment_due_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'booking payment window has expired';
  END IF;
  IF v_booking.price_dop <= 1 THEN
    RAISE EXCEPTION 'catalog price is not configured; checkout is disabled';
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_payment.booking_id <> p_booking_id OR v_payment.provider <> 'stripe' THEN
      RAISE EXCEPTION 'idempotency key is already assigned to another payment';
    END IF;
    IF v_payment.status <> 'pending' THEN
      RAISE EXCEPTION 'this payment attempt is no longer pending; create a new attempt';
    END IF;
    RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code, v_payment.checkout_expires_at;
    RETURN;
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE booking_id = p_booking_id AND status IN ('pending', 'held')
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF v_payment.provider <> 'stripe' OR v_payment.status <> 'pending' THEN
      RAISE EXCEPTION 'booking already has an active payment attempt';
    END IF;
    RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code, v_payment.checkout_expires_at;
    RETURN;
  END IF;

  v_expires_at := least(v_booking.payment_due_at, clock_timestamp() + interval '10 minutes');
  INSERT INTO public.payments (
    booking_id, provider, amount_dop, currency_code, status, idempotency_key, checkout_expires_at
  )
  VALUES (
    p_booking_id, 'stripe', v_booking.price_dop, 'DOP', 'pending', p_idempotency_key, v_expires_at
  )
  RETURNING * INTO v_payment;

  RETURN QUERY SELECT v_payment.id, v_payment.amount_dop, v_payment.currency_code, v_payment.checkout_expires_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_stripe_payment_attempt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stripe_payment_attempt(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.attach_stripe_payment_intent(
  p_payment_id uuid,
  p_payment_intent_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  IF p_payment_id IS NULL OR p_payment_intent_id IS NULL
     OR p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'invalid Stripe payment intent reference';
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE id = p_payment_id AND provider = 'stripe' FOR UPDATE;
  IF NOT FOUND OR v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'Stripe payment attempt is not pending';
  END IF;
  IF v_payment.checkout_expires_at IS NULL OR v_payment.checkout_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Stripe payment attempt has expired';
  END IF;
  IF v_payment.provider_ref IS NOT NULL AND v_payment.provider_ref <> p_payment_intent_id THEN
    RAISE EXCEPTION 'payment attempt already has a different Stripe intent';
  END IF;

  UPDATE public.payments SET provider_ref = p_payment_intent_id, updated_at = clock_timestamp()
  WHERE id = p_payment_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_stripe_payment_intent(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_stripe_payment_intent(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.process_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payment_intent_id text,
  p_amount_received_minor bigint DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_failure_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_event public.stripe_webhook_events%rowtype;
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_expected_minor bigint;
  v_refund_reason text;
BEGIN
  IF p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9]+$'
     OR p_event_type IS NULL OR length(p_event_type) > 120 THEN
    RAISE EXCEPTION 'invalid Stripe event';
  END IF;

  INSERT INTO public.stripe_webhook_events(event_id, event_type, payment_intent_id)
  VALUES (p_event_id, p_event_type, p_payment_intent_id)
  ON CONFLICT (event_id) DO NOTHING;

  SELECT * INTO v_event FROM public.stripe_webhook_events
  WHERE event_id = p_event_id FOR UPDATE;

  IF v_event.processing_status = 'processed' THEN RETURN 'already_processed'; END IF;
  IF v_event.event_type NOT IN ('payment_intent.succeeded', 'payment_intent.payment_failed') THEN
    UPDATE public.stripe_webhook_events
    SET processing_status = 'processed', processed_at = clock_timestamp(), last_error = NULL
    WHERE event_id = p_event_id;
    RETURN 'ignored';
  END IF;

  IF p_payment_intent_id IS NULL OR p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Stripe event has no valid PaymentIntent';
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE provider = 'stripe' AND provider_ref = p_payment_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stripe PaymentIntent is not linked to a Klipp payment'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_payment.booking_id FOR UPDATE;

  IF p_event_type = 'payment_intent.payment_failed' THEN
    IF v_payment.status = 'pending' THEN
      UPDATE public.payments
      SET status = 'failed', response_code = 'payment_failed',
          response_message = left(coalesce(p_failure_message, 'Stripe payment failed'), 500),
          updated_at = clock_timestamp()
      WHERE id = v_payment.id;
      IF v_booking.status = 'payment_pending'
         AND v_booking.payment_due_at <= clock_timestamp() THEN
        UPDATE public.bookings SET status = 'expired' WHERE id = v_booking.id;
      END IF;
    END IF;
    UPDATE public.stripe_webhook_events
    SET processing_status = 'processed', processed_at = clock_timestamp(), last_error = NULL
    WHERE event_id = p_event_id;
    RETURN 'payment_failed';
  END IF;

  IF p_amount_received_minor IS NULL OR p_amount_received_minor <= 0 THEN
    RAISE EXCEPTION 'Stripe success event has an invalid received amount';
  END IF;
  v_expected_minor := round(v_payment.amount_dop * 100)::bigint;

  IF v_payment.status <> 'pending' THEN
    IF v_payment.status IN ('held', 'released')
       AND v_payment.provider_amount_dop = (p_amount_received_minor::numeric / 100)
       AND lower(coalesce(p_currency, '')) = 'dop' THEN
      UPDATE public.stripe_webhook_events
      SET processing_status = 'processed', processed_at = clock_timestamp(), last_error = NULL
      WHERE event_id = p_event_id;
      RETURN 'payment_already_confirmed';
    END IF;
    RAISE EXCEPTION 'Stripe payment is no longer pending';
  END IF;

  IF p_amount_received_minor <> v_expected_minor THEN
    v_refund_reason := 'Stripe captured an amount different from the customer-approved booking price';
  ELSIF lower(coalesce(p_currency, '')) <> 'dop' THEN
    v_refund_reason := 'Stripe payment currency does not match DOP booking currency';
  ELSIF v_payment.checkout_expires_at IS NULL OR v_payment.checkout_expires_at <= clock_timestamp() THEN
    v_refund_reason := 'Stripe approval arrived after the checkout attempt expired';
  ELSIF v_booking.status <> 'payment_pending'
     OR v_booking.payment_due_at IS NULL OR v_booking.payment_due_at <= clock_timestamp() THEN
    v_refund_reason := 'Stripe approval arrived after the booking payment window or booking state expired';
  END IF;

  UPDATE public.payments
  SET status = 'held', held_at = clock_timestamp(),
      provider_amount_dop = p_amount_received_minor::numeric / 100,
      response_code = 'succeeded',
      response_message = CASE WHEN v_refund_reason IS NULL
        THEN 'Stripe payment confirmed by signed webhook'
        ELSE 'Stripe payment received; refund reconciliation required' END,
      refund_required_at = CASE WHEN v_refund_reason IS NULL THEN NULL ELSE clock_timestamp() END,
      refund_reason = v_refund_reason, updated_at = clock_timestamp()
  WHERE id = v_payment.id;

  IF v_refund_reason IS NOT NULL THEN
    IF v_booking.status = 'payment_pending' THEN
      UPDATE public.bookings SET status = 'expired' WHERE id = v_booking.id;
    END IF;
    UPDATE public.stripe_webhook_events
    SET processing_status = 'processed', processed_at = clock_timestamp(), last_error = NULL
    WHERE event_id = p_event_id;
    RETURN 'refund_required';
  END IF;

  UPDATE public.bookings
  SET status = 'requested', price_locked_at = coalesce(price_locked_at, clock_timestamp())
  WHERE id = v_booking.id AND status = 'payment_pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'booking could not be activated after Stripe payment'; END IF;

  IF v_booking.pro_id IS NOT NULL THEN
    INSERT INTO public.booking_requests(booking_id, pro_id, expires_at)
    VALUES (v_booking.id, v_booking.pro_id, clock_timestamp() + interval '45 seconds')
    ON CONFLICT (booking_id, pro_id) DO UPDATE
      SET status = 'pending', created_at = clock_timestamp(),
          expires_at = clock_timestamp() + interval '45 seconds', responded_at = NULL;
  END IF;

  UPDATE public.stripe_webhook_events
  SET processing_status = 'processed', processed_at = clock_timestamp(), last_error = NULL
  WHERE event_id = p_event_id;
  RETURN 'payment_confirmed';
END;
$function$;

REVOKE ALL ON FUNCTION public.process_stripe_webhook_event(text, text, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_stripe_webhook_event(text, text, text, bigint, text, text) TO service_role;
