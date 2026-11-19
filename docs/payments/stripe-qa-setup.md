# Klipp Stripe payment backend (QA)

## Functions

- `stripe-create-payment-intent`: authenticated client endpoint. It creates or reuses a Klipp payment attempt, creates a Stripe PaymentIntent with a stable Stripe idempotency key, and attaches the PaymentIntent to the payment row before returning the client secret.
- `stripe-webhook`: public Stripe webhook endpoint. It verifies the signature against the unmodified request body and delegates state changes to `public.process_stripe_webhook_event`.

## Required Supabase function secrets

Set these in the QA project before deploying/enabling either function:

- `STRIPE_SECRET_KEY`: test-mode secret key only for QA.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the QA webhook endpoint.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never add secret values to Git, Expo public variables, app config, issue comments or logs.

## Deploy

Deploy both functions with JWT verification enabled for `stripe-create-payment-intent` and disabled for `stripe-webhook`. The webhook validates Stripe's signature itself.

Configure the Stripe test-mode webhook to send:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`

Use the deployed `stripe-webhook` URL as the destination. Copy its signing secret to the Supabase function secret named `STRIPE_WEBHOOK_SECRET`.

## Required client contract

The mobile client must:

1. Create the booking through `create_stripe_prepaid_service_booking_at_location`.
2. Generate and persist one UUID idempotency key for that checkout attempt.
3. Invoke `stripe-create-payment-intent` with `bookingId` and `idempotencyKey`.
4. Present the returned PaymentIntent client secret with Stripe PaymentSheet.
5. Treat the client result as presentation feedback only. The booking is paid only after the signed webhook changes the database state.
6. Refresh the booking from Supabase and wait for the server-side status transition before showing a confirmed booking or dispatching a professional.

Do not call the legacy booking creation RPCs for a Stripe prepaid checkout. Do not dispatch a booking from the mobile client after the payment sheet closes.

## Current release gate

This backend slice is not production-ready until the mobile PaymentSheet is implemented, signed webhook delivery is exercised in Stripe test mode, replay/race/late-payment/refund cases pass, and the legal entity's Stripe eligibility and payout route are confirmed.

Stripe lists DOP as a supported presentment currency, but this does not mean a business registered in the Dominican Republic can open a Stripe account. Check the current Stripe global availability and account requirements before onboarding.
