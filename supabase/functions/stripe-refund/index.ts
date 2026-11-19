import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (key: string) => { const value = Deno.env.get(key); if (!value) throw new Error(`Missing server configuration: ${key}`); return value; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });
    const supabaseUrl = env("SUPABASE_URL");
    const userClient = createClient(supabaseUrl, env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json(401, { error: "invalid_session" });
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

    if (body.action === "request") {
      if (typeof body.bookingId !== "string" || !Number.isSafeInteger(body.amountMinor) || Number(body.amountMinor) <= 0
        || typeof body.idempotencyKey !== "string" || typeof body.reason !== "string") return json(400, { error: "invalid_refund_request" });
      const { data, error } = await userClient.rpc("request_stripe_refund", {
        p_booking_id: body.bookingId, p_amount_minor: body.amountMinor, p_reason: body.reason,
        p_note: typeof body.note === "string" ? body.note.slice(0, 1000) : null,
        p_idempotency_key: body.idempotencyKey,
      });
      if (error) return json(409, { error: "refund_request_rejected", detail: error.message });
      return json(202, { refundRequestId: data, status: "requested" });
    }

    if (!["process", "retry_reversal"].includes(String(body.action)) || typeof body.refundRequestId !== "string") return json(400, { error: "invalid_action" });
    const { data: canManage, error: permissionError } = await userClient.rpc("has_admin_permission", { p_permission_code: "finance.reconcile" });
    if (permissionError || canManage !== true) return json(403, { error: "finance_permission_required" });

    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 20000 });
    const service = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

    if (body.action === "retry_reversal") {
      const { data: reversalRows, error: reversalPrepareError } = await userClient.rpc("prepare_stripe_transfer_reversal", { p_refund_id: body.refundRequestId });
      if (reversalPrepareError) return json(409, { error: "transfer_reversal_not_eligible", detail: reversalPrepareError.message });
      const reversalItem = Array.isArray(reversalRows) ? reversalRows[0] : reversalRows;
      if (!reversalItem?.transfer_id || Number(reversalItem.amount_minor) <= 0) return json(500, { error: "invalid_reversal_payload" });
      try {
        const reversal = await stripe.transfers.createReversal(String(reversalItem.transfer_id), {
          amount: Number(reversalItem.amount_minor), metadata: { klipp_refund_request_id: String(reversalItem.refund_id) },
        }, { idempotencyKey: `klipp-refund-reversal-${reversalItem.refund_id}` });
        const { error: completeReversalError } = await service.rpc("complete_stripe_transfer_reversal", {
          p_refund_id: reversalItem.refund_id, p_reversal_id: reversal.id, p_failure_message: null,
        });
        if (completeReversalError) return json(503, { error: "reversal_created_reconciliation_pending" });
        return json(200, { status: "reversed", transferReversalId: reversal.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transfer reversal failed";
        await service.rpc("complete_stripe_transfer_reversal", {
          p_refund_id: reversalItem.refund_id, p_reversal_id: null, p_failure_message: message.slice(0, 500),
        });
        throw error;
      }
    }

    const { data: rows, error: prepareError } = await userClient.rpc("prepare_stripe_refund", { p_refund_request_id: body.refundRequestId });
    if (prepareError) return json(409, { error: "refund_not_eligible", detail: prepareError.message });
    const item = Array.isArray(rows) ? rows[0] : rows;
    if (!item?.refund_id || !item?.payment_intent_id || !Number.isSafeInteger(Number(item.amount_minor))) return json(500, { error: "invalid_refund_payload" });

    let stripeRefundId: string | null = null;
    let reversalId: string | null = null;
    let reversalPending = false;
    try {
      const refund = await stripe.refunds.create({
        payment_intent: String(item.payment_intent_id),
        amount: Number(item.amount_minor),
        reason: ["duplicate", "fraudulent", "requested_by_customer"].includes(String(body.stripeReason))
          ? body.stripeReason as "duplicate" | "fraudulent" | "requested_by_customer"
          : "requested_by_customer",
        metadata: { klipp_refund_request_id: String(item.refund_id), klipp_booking_id: String(item.booking_id) },
      }, { idempotencyKey: `klipp-refund-${item.refund_id}` });
      stripeRefundId = refund.id;

      if (item.transfer_id && Number(item.transfer_reversal_amount_minor) > 0) {
        try {
          const reversal = await stripe.transfers.createReversal(String(item.transfer_id), {
            amount: Number(item.transfer_reversal_amount_minor),
            metadata: { klipp_refund_request_id: String(item.refund_id) },
          }, { idempotencyKey: `klipp-refund-reversal-${item.refund_id}` });
          reversalId = reversal.id;
        } catch (error) {
          reversalPending = true;
          console.error("stripe_transfer_reversal_pending", { refundId: item.refund_id, error });
        }
      }
      const { error: completeError } = await service.rpc("complete_stripe_refund", {
        p_refund_id: item.refund_id, p_stripe_refund_id: stripeRefundId,
        p_transfer_reversal_id: reversalId, p_failure_code: null, p_failure_message: null,
        p_reversal_pending: reversalPending,
      });
      if (completeError) return json(503, { error: "refund_created_reconciliation_pending" });
      return json(200, { status: "succeeded", refundId: stripeRefundId, transferReversalId: reversalId, transferReversalPending: reversalPending });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe refund failed";
      if (!stripeRefundId) {
        await service.rpc("complete_stripe_refund", {
          p_refund_id: item.refund_id, p_stripe_refund_id: null, p_transfer_reversal_id: null,
          p_failure_code: "stripe_refund_failed", p_failure_message: message.slice(0, 500),
          p_reversal_pending: false,
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("stripe_refund_failed", error);
    return json(500, { error: "refund_processing_failed" });
  }
});
