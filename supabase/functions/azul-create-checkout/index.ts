import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createCheckoutToken,
  getAzulConfig,
  getSupabaseServiceConfig,
  sha256Hex,
} from "../_shared/azul.ts";

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

function newOrderNumber(): string {
  const random = new Uint32Array(2);
  crypto.getRandomValues(random);
  return `${Date.now().toString().slice(-10)}${String(random[0] % 1_000_000).padStart(6, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse({ error: "Authentication required" }, 401);

    const { url, anonKey, serviceRoleKey } = getSupabaseServiceConfig();
    const userClient = createClient(url, anonKey);
    const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authData.user) return jsonResponse({ error: "Invalid session" }, 401);

    const body = await req.json().catch(() => ({}));
    const bookingId = body?.bookingId;
    if (typeof bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return jsonResponse({ error: "bookingId is required" }, 400);
    }

    const config = getAzulConfig();
    const admin = createClient(url, serviceRoleKey);
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, client_id, status, price_dop, payment_due_at")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) return jsonResponse({ error: "Booking not found" }, 404);
    if (booking.client_id !== authData.user.id) return jsonResponse({ error: "Not allowed" }, 403);
    if (booking.status !== "payment_pending") return jsonResponse({ error: "Booking is not awaiting payment" }, 409);
    if (!booking.payment_due_at || new Date(booking.payment_due_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "Payment window expired" }, 409);
    }
    const amountDop = Number(booking.price_dop);
    if (!Number.isFinite(amountDop) || amountDop <= 0) {
      return jsonResponse({ error: "Invalid booking amount" }, 409);
    }

    const { data: attemptRows, error: attemptError } = await admin.rpc("create_booking_payment_attempt", {
      p_booking_id: bookingId,
      p_provider_order_number: newOrderNumber(),
      p_idempotency_key: crypto.randomUUID(),
    });
    if (attemptError) throw attemptError;
    const attempt = Array.isArray(attemptRows) ? attemptRows[0] : attemptRows;
    if (!attempt?.payment_id || Number(attempt.amount_dop) !== amountDop || attempt.currency_code !== "DOP") {
      throw new Error("Payment attempt did not match the locked booking quote");
    }

    const expiresAt = Math.min(
      Date.now() + 5 * 60_000,
      new Date(attempt.checkout_expires_at).getTime(),
      new Date(booking.payment_due_at).getTime(),
    );
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return jsonResponse({ error: "Payment window expired" }, 409);
    }

    const token = await createCheckoutToken({
      paymentId: attempt.payment_id,
      bookingId,
      exp: Math.floor(expiresAt / 1000),
      nonce: crypto.randomUUID(),
    }, config.checkoutTokenSecret);
    const sessionHash = await sha256Hex(token);
    const { error: sessionError } = await admin.rpc("set_azul_checkout_session", {
      p_payment_id: attempt.payment_id,
      p_session_hash: sessionHash,
      p_expires_at: new Date(expiresAt).toISOString(),
    });
    if (sessionError) throw sessionError;

    const checkoutUrl = new URL(config.checkoutPageUrl);
    checkoutUrl.searchParams.set("token", token);
    return jsonResponse({
      checkoutUrl: checkoutUrl.toString(),
      expiresAt: new Date(expiresAt).toISOString(),
      amountDop,
      currency: "DOP",
    });
  } catch (error) {
    console.error("AZUL checkout initialization failed", error instanceof Error ? error.message : "unknown error");
    return jsonResponse({ error: "No se pudo iniciar el pago. Inténtalo de nuevo o consulta Mis reservas." }, 500);
  }
});
