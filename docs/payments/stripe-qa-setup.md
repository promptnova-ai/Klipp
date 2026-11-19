# Klipp Stripe marketplace payments (QA)

## Architecture

Klipp uses a platform-owned Stripe account with Stripe Connect Express accounts for eligible professionals. The customer charge is created on the platform PaymentIntent. Transfers are separate and are only released after the booking is marked completed.

The payment core remains country-aware. Connect onboarding is disabled unless the professional's country is explicitly enabled by server configuration. Do not enable the Dominican Republic unless Stripe confirms the platform/connected-account cross-border flow in writing. DOP presentment support does not itself make a Dominican entity or Dominican connected account eligible.

## Edge Functions

- `stripe-create-payment-intent`: authenticated checkout endpoint. Creates/reuses a Klipp payment attempt, uses a stable Stripe idempotency key and transfer group, and associates the PaymentIntent before returning its client secret.
- `stripe-connect-onboard`: authenticated professional endpoint. Creates/reuses an Express connected account and returns a short-lived Stripe-hosted onboarding link. The legal country is server-controlled, never accepted from the mobile client.
- `stripe-release-transfer`: authenticated professional/admin endpoint. Requires a completed booking, a captured payment and an eligible connected account. Creates a transfer linked to the original charge using `source_transaction` and an idempotency key.
- `stripe-refund`: customers create refund requests; staff with `finance.reconcile` approve/process them. Supports partial and full refunds, including asynchronous pending/failed statuses synchronized by refund webhooks. If a professional transfer has already been sent, it attempts the proportional transfer reversal only after the refund succeeds. Failed reversals remain flagged and can be retried with `action: retry_reversal`.
- `stripe-webhook`: public Stripe endpoint. Verifies the signature against the raw request body. Processes PaymentIntent state, Connect account updates and dispute events; event IDs are deduplicated.

## Required Supabase Edge Function secrets

Set these in the QA project before deployment:

- `STRIPE_SECRET_KEY`: Stripe test-mode secret key.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the QA webhook endpoint.
- `STRIPE_CONNECT_DEFAULT_COUNTRY`: two-letter legal country code for the connected accounts enabled in this QA environment.
- `STRIPE_CONNECT_ALLOWED_COUNTRIES`: comma-separated server-side allowlist. Must be restricted to countries Stripe has approved for this platform and flow.
- `KLIPP_PUBLIC_URL`: HTTPS base URL for Stripe Connect refresh and return URLs.
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Never add secret values to Git, Expo public variables, app config, issue comments or logs.

## Webhook events

Configure the Stripe test-mode endpoint to send:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `account.updated`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.refunded`

Stripe retries a webhook when Klipp returns a 5xx because the event was not durably processed. Duplicate event IDs are safe to replay.

## Mobile/client contract

1. Create the booking through `create_stripe_prepaid_service_booking_at_location`.
2. Generate and persist one UUID idempotency key for that checkout attempt.
3. Invoke `stripe-create-payment-intent` with `bookingId` and `idempotencyKey`.
4. Present the returned PaymentIntent client secret with Stripe PaymentSheet.
5. Treat the client result as presentation feedback only. A booking is paid only after the signed webhook changes the database state.
6. Refresh the booking from Supabase and wait for the server-side status transition before showing a confirmed booking or dispatching a professional.
7. After completion, invoke `stripe-release-transfer` from a trusted authenticated workflow; never transfer from a mobile-only status claim.
8. Refund requests use `stripe-refund` with `action: request`. Staff review uses `action: process`; pending transfer reversals use `action: retry_reversal`.

## Database protections

- Server-calculated prices and 7% commission; no client-supplied amount is trusted.
- PaymentIntent and refund/transfer operations use stable idempotency keys.
- Webhook signatures are verified on raw request bodies; webhook event IDs are deduplicated.
- Financial tables are RLS-enabled with no direct client grants; service role and guarded RPCs are used for writes.
- Refund amounts cannot exceed the captured amount less prior successful and in-flight refunds.
- Transfer reversals are cumulative and capped at the original professional transfer.
- Payment ledger entries are append-only operational records with unique idempotency keys.
- A failed transfer reversal is not hidden: it remains pending for staff reconciliation.

## Deployment

Deploy authenticated endpoints with JWT verification enabled:
- `stripe-create-payment-intent`
- `stripe-connect-onboard`
- `stripe-release-transfer`
- `stripe-refund`

Deploy `stripe-webhook` with gateway JWT verification disabled because it validates Stripe's signature itself.

## Release gates

This is a QA implementation, not production activation. Before launch:

- Implement and test the mobile PaymentSheet and professional Connect onboarding UI.
- Wire the completion workflow to the trusted transfer-release endpoint or a durable outbox worker.
- Run Stripe test-mode E2E tests for success, declines, duplicate clicks, webhook replay/out-of-order delivery, late success, partial/full refunds, refund after transfer, failed transfer/reversal retries and disputes.
- Reconcile the Klipp ledger against Stripe balance transactions and payouts.
- Confirm legal entity eligibility, Connect country coverage, cross-border transfer route, negative-balance liability, marketplace terms and payment-services obligations.
- Add monitoring/alerts and operational runbooks.
- Keep live mode disabled until all gates pass.

No production deployment or live Stripe configuration should be made from this QA branch.
