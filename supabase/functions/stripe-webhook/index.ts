import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const encoder = new TextEncoder();
const SIGNATURE_TOLERANCE_SECONDS = 300;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const parts = signatureHeader.split(",");
  const timestampValue = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestamp = Number(timestampValue);
  if (!Number.isSafeInteger(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload)));
  return signatures.some((signature) => constantTimeEqual(signature, expected));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Webhook is not configured" }, 503);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature || !(await verifyStripeSignature(rawBody, signature, webhookSecret))) {
      return jsonResponse({ error: "Invalid Stripe signature" }, 400);
    }

    const event = JSON.parse(rawBody);
    const object = event?.data?.object ?? {};
    const isCheckoutCompleted = event.type === "checkout.session.completed";
    if (isCheckoutCompleted && object.payment_status !== "paid") {
      return jsonResponse({ received: true, status: "checkout_not_paid" });
    }

    const paymentIntentId = isCheckoutCompleted
      ? (typeof object.payment_intent === "string" ? object.payment_intent : object.payment_intent?.id)
      : (typeof object.id === "string" && object.id.startsWith("pi_") ? object.id : null);
    const paymentId = typeof object.metadata?.payment_id === "string" ? object.metadata.payment_id : null;
    let amountReceivedMinor: number | null = null;
    let currency: string | null = null;
    let failureMessage: string | null = null;

    if (event.type === "payment_intent.succeeded") {
      amountReceivedMinor = Number(object.amount_received);
      currency = typeof object.currency === "string" ? object.currency : null;
    } else if (isCheckoutCompleted) {
      amountReceivedMinor = Number(object.amount_total);
      currency = typeof object.currency === "string" ? object.currency : null;
    } else if (event.type === "payment_intent.payment_failed") {
      failureMessage = typeof object.last_payment_error?.message === "string"
        ? object.last_payment_error.message.slice(0, 500)
        : "Stripe payment failed";
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Checkout can complete before or after payment_intent.succeeded is delivered.
    // Link the PaymentIntent from trusted Stripe metadata before processing either event.
    if (paymentId && paymentIntentId && /^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
      const { data: linkedPayment, error: lookupError } = await admin
        .from("payments")
        .select("provider_ref, status")
        .eq("id", paymentId)
        .eq("provider", "stripe")
        .maybeSingle();
      if (lookupError || !linkedPayment) {
        console.error("Stripe webhook payment lookup failed", event.id, lookupError);
        return jsonResponse({ error: "Payment reference not found" }, 404);
      }
      if (linkedPayment.provider_ref !== paymentIntentId) {
        if (linkedPayment.status !== "pending") {
          return jsonResponse({ error: "Payment reference is no longer attachable" }, 409);
        }
        const { error: attachError } = await admin.rpc("attach_stripe_payment_intent", {
          p_payment_id: paymentId,
          p_payment_intent_id: paymentIntentId,
        });
        if (attachError) {
          console.error("Stripe webhook could not link PaymentIntent", event.id, attachError);
          return jsonResponse({ error: "Payment reference could not be linked" }, 409);
        }
      }
    }

    const processingEventType = isCheckoutCompleted ? "payment_intent.succeeded" : event.type;
    const { data, error } = await admin.rpc("process_stripe_webhook_event", {
      p_event_id: event.id,
      p_event_type: processingEventType,
      p_payment_intent_id: paymentIntentId,
      p_amount_received_minor: Number.isSafeInteger(amountReceivedMinor) ? amountReceivedMinor : null,
      p_currency: currency,
      p_failure_message: failureMessage,
    });
    if (error) {
      console.error("Stripe webhook database processing failed", event.id, error);
      return jsonResponse({ error: "Webhook processing failed" }, 500);
    }

    return jsonResponse({ received: true, result: data });
  } catch (error) {
    console.error("Stripe webhook handler failed", error);
    return jsonResponse({ error: "Webhook handler failed" }, 500);
  }
});
