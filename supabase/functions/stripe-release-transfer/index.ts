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
    const bookingId = body.bookingId;
    if (typeof bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(bookingId)) return json(400, { error: "invalid_booking_id" });

    const { data: booking, error: bookingError } = await userClient.from("bookings")
      .select("id,pro_id,status").eq("id", bookingId).maybeSingle();
    if (bookingError || !booking || booking.status !== "completed") return json(404, { error: "completed_booking_not_found" });
    const isPro = booking.pro_id === auth.user.id;
    const { data: canManage } = await userClient.rpc("has_admin_permission", { p_permission_code: "finance.reconcile" });
    if (!isPro && canManage !== true) return json(403, { error: "forbidden" });

    const service = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: rows, error: prepareError } = await service.rpc("prepare_stripe_transfer", { p_booking_id: bookingId });
    if (prepareError) return json(409, { error: "transfer_not_eligible", detail: prepareError.message });
    const transfer = Array.isArray(rows) ? rows[0] : rows;
    if (!transfer?.transfer_row_id || !transfer?.payment_intent_id || !transfer?.stripe_account_id) return json(500, { error: "invalid_transfer_payload" });

    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 20000 });
    const intent = await stripe.paymentIntents.retrieve(transfer.payment_intent_id);
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    if (!chargeId) return json(409, { error: "payment_charge_not_available" });

    try {
      const created = await stripe.transfers.create({
        amount: Number(transfer.amount_minor),
        currency: String(transfer.currency_code).toLowerCase(),
        destination: String(transfer.stripe_account_id),
        source_transaction: chargeId,
        transfer_group: String(transfer.transfer_group),
        metadata: { klipp_booking_id: bookingId, klipp_transfer_row_id: String(transfer.transfer_row_id) },
      }, { idempotencyKey: `klipp-transfer-${transfer.transfer_row_id}` });
      const { error: completeError } = await service.rpc("complete_stripe_transfer", {
        p_transfer_row_id: transfer.transfer_row_id, p_stripe_transfer_id: created.id,
        p_failure_code: null, p_failure_message: null,
      });
      if (completeError) return json(503, { error: "transfer_created_reconciliation_pending" });
      return json(200, { status: "paid", transferId: created.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe transfer failed";
      await service.rpc("complete_stripe_transfer", {
        p_transfer_row_id: transfer.transfer_row_id, p_stripe_transfer_id: null,
        p_failure_code: "stripe_transfer_failed", p_failure_message: message.slice(0, 500),
      });
      throw error;
    }
  } catch (error) {
    console.error("stripe_release_transfer_failed", error);
    return json(500, { error: "transfer_failed" });
  }
});
