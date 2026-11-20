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
    if (typeof bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return jsonResponse({ error: "A valid bookingId is required" }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authResult, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authResult.user) return jsonResponse({ error: "Invalid session" }, 401);

    // Amount, currency and ownership are resolved by Postgres, never by the client.
    const idempotencyKey = `klipp-booking-${bookingId}`;
    const { data: attemptRows, error: attemptError } = await userClient.rpc("create_stripe_payment_attempt", {
      p_booking_id: bookingId,
      p_idempotency_key: idempotencyKey,
    });
    if (attemptError) {
      console.error("Could not create Stripe checkout attempt", attemptError);
      return jsonResponse({ error: "Booking is not ready for payment" }, 409);
    }
    const attempt = Array.isArray(attemptRows) ? attemptRows[0] : attemptRows;
    if (!attempt?.payment_id || attempt.currency_code !== "DOP") {
      return jsonResponse({ error: "Invalid payment attempt returned by the server" }, 500);
    }

    const amountDop = Number(attempt.amount_dop);
    const amountMinor = Math.round(amountDop * 100);
    if (!Number.isFinite(amountDop) || amountMinor < 1 || !Number.isSafeInteger(amountMinor)) {
      return jsonResponse({ error: "Booking amount is outside Stripe's supported limits" }, 422);
    }

    const returnUrl = `klipp://payment-return?booking_id=${encodeURIComponent(bookingId)}`;
    const params = new URLSearchParams();
    params.set("mode", "payment");
    // Stripe requires a minimum 30-minute Checkout expiry; the DB payment window is shorter and rejects/refunds late captures.
    params.set("expires_at", String(Math.floor(Date.now() / 1000) + 30 * 60));
    params.set("payment_method_types[0]", "card");
    params.set("line_items[0][price_data][currency]", "dop");
    params.set("line_items[0][price_data][unit_amount]", String(amountMinor));
    params.set("line_items[0][price_data][product_data][name]", "Servicio Klipp");
    params.set("line_items[0][price_data][product_data][description]", `Reserva ${bookingId}`);
    params.set("line_items[0][quantity]", "1");
    params.set("client_reference_id", bookingId);
    params.set("metadata[payment_id]", attempt.payment_id);
    params.set("metadata[booking_id]", bookingId);
    params.set("payment_intent_data[metadata][payment_id]", attempt.payment_id);
    params.set("payment_intent_data[metadata][booking_id]", bookingId);
    params.set("success_url", `${returnUrl}&result=success`);
    params.set("cancel_url", `${returnUrl}&result=cancelled`);

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `klipp-checkout-${attempt.payment_id}`,
      },
      body: params.toString(),
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok || typeof session?.id !== "string" || typeof session?.url !== "string") {
      console.error("Stripe Checkout Session creation failed", stripeResponse.status, session?.error?.type);
      return jsonResponse({ error: "Could not create secure checkout session" }, 502);
    }

    return jsonResponse({
      checkoutUrl: session.url,
      sessionId: session.id,
      paymentId: attempt.payment_id,
      amountDop,
      currency: "DOP",
      expiresAt: attempt.checkout_expires_at,
    });
  } catch (error) {
    console.error("Stripe Checkout initialization failed", error);
    return jsonResponse({ error: "Could not initialize secure checkout" }, 500);
  }
});
