import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const asId = (value: string | { id: string } | null | undefined): string | null =>
  typeof value === "string" ? value : value?.id ?? null;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, { error: "method_not_allowed" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return response(400, { error: "missing_signature" });

  try {
    const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
      httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2,
    });
    const rawBody = await req.text();
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody, signature, requiredEnv("STRIPE_WEBHOOK_SECRET"), undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (error) {
      console.warn("stripe_webhook_signature_rejected", error);
      return response(400, { error: "invalid_signature" });
    }

    const service = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (event.type.startsWith("payment_intent.")) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const latestChargeId = asId(intent.latest_charge);
      if (latestChargeId) {
        const { error: chargeLinkError } = await service.from("payments")
          .update({ stripe_latest_charge_id: latestChargeId, stripe_transfer_group: intent.transfer_group })
          .eq("provider", "stripe").eq("provider_ref", intent.id);
        if (chargeLinkError) {
          console.error("stripe_charge_link_failed", { eventId: event.id, message: chargeLinkError.message });
          return response(500, { error: "charge_link_failed" });
        }
      }

      let amountReceived: number | null = null;
      let currency: string | null = null;
      let failureMessage: string | null = null;
      if (event.type === "payment_intent.succeeded") {
        amountReceived = intent.amount_received;
        currency = intent.currency;
      } else if (event.type === "payment_intent.payment_failed") {
        failureMessage = intent.last_payment_error?.message?.slice(0, 500) ?? "Payment failed";
      }

      const { data, error } = await service.rpc("process_stripe_webhook_event", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_payment_intent_id: intent.id,
        p_amount_received_minor: amountReceived,
        p_currency: currency,
        p_failure_message: failureMessage,
      });
      if (error) {
        console.error("stripe_webhook_processing_failed", { eventId: event.id, eventType: event.type, message: error.message });
        return response(500, { error: "webhook_processing_failed" });
      }
      return response(200, { received: true, result: data });
    }

    let objectId: string | null = null;
    let accountId: string | null = null;
    let detailsSubmitted: boolean | null = null;
    let chargesEnabled: boolean | null = null;
    let payoutsEnabled: boolean | null = null;
    let transfersCapability: string | null = null;
    let currentlyDue: unknown = [];
    let pastDue: unknown = [];
    let disabledReason: string | null = null;
    let disputeChargeId: string | null = null;
    let paymentIntentId: string | null = null;
    let disputeAmount: number | null = null;
    let currency: string | null = null;
    let disputeStatus: string | null = null;
    let disputeReason: string | null = null;
    let evidenceDueAt: string | null = null;

    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      objectId = account.id;
      accountId = account.id;
      detailsSubmitted = account.details_submitted;
      chargesEnabled = account.charges_enabled;
      payoutsEnabled = account.payouts_enabled;
      transfersCapability = account.capabilities?.transfers ?? null;
      currentlyDue = account.requirements?.currently_due ?? [];
      pastDue = account.requirements?.past_due ?? [];
      disabledReason = account.requirements?.disabled_reason ?? null;
      const proId = account.metadata?.klipp_pro_user_id;
      if (proId && /^[0-9a-f-]{36}$/i.test(proId)) {
        const { error: accountSyncError } = await service.rpc("upsert_stripe_connected_account", {
          p_pro_id: proId,
          p_account_id: account.id,
          p_country_code: account.country,
          p_details_submitted: account.details_submitted,
          p_charges_enabled: account.charges_enabled,
          p_payouts_enabled: account.payouts_enabled,
          p_transfers_capability: account.capabilities?.transfers ?? null,
          p_currently_due: account.requirements?.currently_due ?? [],
          p_past_due: account.requirements?.past_due ?? [],
          p_disabled_reason: account.requirements?.disabled_reason ?? null,
        });
        if (accountSyncError) {
          console.error("stripe_connected_account_sync_failed", { eventId: event.id, message: accountSyncError.message });
          return response(500, { error: "connected_account_sync_failed" });
        }
      }
    } else if (event.type.startsWith("refund.")) {
      const refund = event.data.object as Stripe.Refund;
      objectId = refund.id;
      const refundRequestId = refund.metadata?.klipp_refund_request_id;
      if (refundRequestId && ["pending", "succeeded", "failed", "canceled"].includes(String(refund.status))) {
        const { error: refundSyncError } = await service.rpc("sync_stripe_refund_status", {
          p_refund_request_id: refundRequestId,
          p_stripe_refund_id: refund.id,
          p_status: refund.status,
          p_failure_reason: refund.failure_reason ?? null,
        });
        if (refundSyncError) {
          console.error("stripe_refund_webhook_sync_failed", { eventId: event.id, message: refundSyncError.message });
          return response(500, { error: "refund_webhook_sync_failed" });
        }
      }
    } else if (event.type.startsWith("charge.dispute.")) {
      const dispute = event.data.object as Stripe.Dispute;
      objectId = dispute.id;
      disputeChargeId = asId(dispute.charge);
      paymentIntentId = asId(dispute.payment_intent);
      disputeAmount = dispute.amount;
      currency = dispute.currency;
      disputeStatus = dispute.status;
      disputeReason = dispute.reason;
      evidenceDueAt = dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null;
    } else {
      // Refund, transfer and other supported events are durably deduplicated.
      // Their authoritative state is reconciled by the corresponding operation.
      const object = event.data.object as { id?: string };
      objectId = object.id ?? null;
    }

    const { data, error } = await service.rpc("process_stripe_connect_webhook_event", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_object_id: objectId,
      p_account_id: accountId,
      p_details_submitted: detailsSubmitted,
      p_charges_enabled: chargesEnabled,
      p_payouts_enabled: payoutsEnabled,
      p_transfers_capability: transfersCapability,
      p_currently_due: currentlyDue,
      p_past_due: pastDue,
      p_disabled_reason: disabledReason,
      p_dispute_charge_id: disputeChargeId,
      p_payment_intent_id: paymentIntentId,
      p_dispute_amount_minor: disputeAmount,
      p_currency: currency,
      p_dispute_status: disputeStatus,
      p_dispute_reason: disputeReason,
      p_evidence_due_at: evidenceDueAt,
    });
    if (error) {
      console.error("stripe_connect_webhook_processing_failed", { eventId: event.id, eventType: event.type, message: error.message });
      return response(500, { error: "connect_webhook_processing_failed" });
    }
    return response(200, { received: true, result: data });
  } catch (error) {
    console.error("stripe_webhook_unexpected_error", error);
    return response(500, { error: "webhook_internal_error" });
  }
});
