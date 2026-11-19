import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecret = requiredEnv("STRIPE_SECRET_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json(401, { error: "invalid_session" });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }
    const payload = body as Record<string, unknown>;
    if (!isUuid(payload.bookingId) || !isUuid(payload.idempotencyKey)) {
      return json(400, { error: "invalid_request" });
    }

    // The authenticated RPC owns authorization, price lookup, amount locking,
    // single-active-attempt enforcement and retry semantics.
    const { data: attemptRows, error: attemptError } = await userClient.rpc(
      "create_stripe_payment_attempt",
      {
        p_booking_id: payload.bookingId,
        p_idempotency_key: payload.idempotencyKey,
      },
    );
    if (attemptError) {
      return json(409, { error: "payment_attempt_rejected", detail: attemptError.message });
    }

    const attempt = Array.isArray(attemptRows) ? attemptRows[0] : attemptRows;
    if (!attempt?.payment_id || !attempt?.amount_dop || attempt.currency_code !== "DOP") {
      return json(500, { error: "invalid_payment_attempt_response" });
    }

    const amountMinor = Math.round(Number(attempt.amount_dop) * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      return json(500, { error: "invalid_payment_amount" });
    }

    const stripe = new Stripe(stripeSecret, {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
      timeout: 20_000,
    });

    // Stable Stripe idempotency key means a network retry cannot create a
    // second PaymentIntent for the same database payment attempt.
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountMinor,
        currency: "dop",
        payment_method_types: ["card"],
        metadata: {
          klipp_payment_id: String(attempt.payment_id),
          klipp_booking_id: payload.bookingId,
          klipp_user_id: authData.user.id,
        },
        description: "Reserva Klipp",
      },
      { idempotencyKey: `klipp-payment-${attempt.payment_id}` },
    );

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: attachError } = await serviceClient.rpc(
      "attach_stripe_payment_intent",
      {
        p_payment_id: attempt.payment_id,
        p_payment_intent_id: intent.id,
      },
    );
    if (attachError) {
      // Do not return a client secret until the intent is durably associated.
      // A retry reuses the same Stripe intent through the stable idempotency key.
      console.error("stripe_intent_attach_failed", {
        paymentId: attempt.payment_id,
        stripeIntentId: intent.id,
        message: attachError.message,
      });
      return json(503, { error: "payment_initialization_pending" });
    }

    if (!intent.client_secret) return json(502, { error: "stripe_client_secret_missing" });

    return json(200, {
      paymentId: attempt.payment_id,
      clientSecret: intent.client_secret,
      amount: amountMinor,
      currency: "DOP",
    });
  } catch (error) {
    console.error("stripe_create_payment_intent_failed", error);
    return json(500, { error: "payment_initialization_failed" });
  }
});
