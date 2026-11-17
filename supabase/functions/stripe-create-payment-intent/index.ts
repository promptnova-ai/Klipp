import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }
    if (!stripeSecretKey) {
      return jsonResponse({ error: "Stripe is not configured in this environment", code: "STRIPE_NOT_CONFIGURED" }, 503);
    }

    const body = await req.json();
    const bookingId = body?.bookingId;
    const idempotencyKey = body?.idempotencyKey;
    if (typeof bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return jsonResponse({ error: "A valid bookingId is required" }, 400);
    }
    if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 128) {
      return jsonResponse({ error: "A valid idempotencyKey is required" }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authResult, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authResult.user) return jsonResponse({ error: "Invalid session" }, 401);

    // Amount and currency are loaded from the locked booking in Postgres.
    // Never accept an amount supplied by the mobile client.
    const { data: attemptRows, error: attemptError } = await userClient.rpc("create_stripe_payment_attempt", {
      p_booking_id: bookingId,
      p_idempotency_key: idempotencyKey,
    });
    if (attemptError) {
      console.error("Could not create Stripe payment attempt", attemptError);
      return jsonResponse({ error: "Booking is not ready for payment" }, 409);
    }
    const attempt = Array.isArray(attemptRows) ? attemptRows[0] : attemptRows;
    if (!attempt?.payment_id || attempt.currency_code !== "DOP") {
      return jsonResponse({ error: "Invalid payment attempt returned by the server" }, 500);
    }

    const amountDop = Number(attempt.amount_dop);
    const amountMinor = Math.round(amountDop * 100);
    if (!Number.isFinite(amountDop) || amountMinor < 50 || !Number.isSafeInteger(amountMinor)) {
      return jsonResponse({ error: "Booking amount is outside Stripe's supported limits" }, 422);
    }

    const stripeParams = new URLSearchParams();
    stripeParams.set("amount", String(amountMinor));
    stripeParams.set("currency", "dop");
    stripeParams.set("automatic_payment_methods[enabled]", "true");
    stripeParams.set("description", `Klipp booking ${bookingId}`);
    stripeParams.set("metadata[payment_id]", attempt.payment_id);
    stripeParams.set("metadata[booking_id]", bookingId);

    const stripeResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `klipp-payment-${attempt.payment_id}`,
      },
      body: stripeParams.toString(),
    });

    const stripeIntent = await stripeResponse.json();
    if (!stripeResponse.ok || typeof stripeIntent?.id !== "string" || typeof stripeIntent?.client_secret !== "string") {
      console.error("Stripe PaymentIntent creation failed", stripeResponse.status, stripeIntent?.error?.type);
      return jsonResponse({ error: "Could not initialize card payment" }, 502);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: attachError } = await admin.rpc("attach_stripe_payment_intent", {
      p_payment_id: attempt.payment_id,
      p_payment_intent_id: stripeIntent.id,
    });
    if (attachError) {
      // A retry reuses the same Stripe idempotency key and can safely attach the same intent.
      console.error("Could not attach Stripe PaymentIntent to Klipp payment", attachError);
      return jsonResponse({ error: "Payment initialized but could not be linked; retry safely" }, 503);
    }

    return jsonResponse({
      paymentId: attempt.payment_id,
      paymentIntentClientSecret: stripeIntent.client_secret,
      amountDop,
      currency: "DOP",
      expiresAt: attempt.checkout_expires_at,
    });
  } catch (error) {
    console.error("Stripe payment initialization failed", error);
    return jsonResponse({ error: "Could not initialize payment" }, 500);
  }
});
