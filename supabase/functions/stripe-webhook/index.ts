import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, { error: "method_not_allowed" });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return response(400, { error: "missing_signature" });

  try {
    const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
    });
    const cryptoProvider = Stripe.createSubtleCryptoProvider();
    const rawBody = await req.text();

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        requiredEnv("STRIPE_WEBHOOK_SECRET"),
        undefined,
        cryptoProvider,
      );
    } catch (error) {
      console.warn("stripe_webhook_signature_rejected", error);
      return response(400, { error: "invalid_signature" });
    }

    let paymentIntentId: string | null = null;
    let amountReceived: number | null = null;
    let currency: string | null = null;
    let failureMessage: string | null = null;

    if (event.type.startsWith("payment_intent.")) {
      const intent = event.data.object as Stripe.PaymentIntent;
      paymentIntentId = intent.id;
      if (event.type === "payment_intent.succeeded") {
        amountReceived = intent.amount_received;
        currency = intent.currency;
      } else if (event.type === "payment_intent.payment_failed") {
        failureMessage = intent.last_payment_error?.message?.slice(0, 500) ?? "Payment failed";
      }
    }

    const serviceClient = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data, error } = await serviceClient.rpc("process_stripe_webhook_event", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_payment_intent_id: paymentIntentId,
      p_amount_received_minor: amountReceived,
      p_currency: currency,
      p_failure_message: failureMessage,
    });

    if (error) {
      console.error("stripe_webhook_processing_failed", {
        eventId: event.id,
        eventType: event.type,
        message: error.message,
      });
      // Stripe must retry transient/database failures. Never acknowledge
      // an event that has not been committed by the database transaction.
      return response(500, { error: "webhook_processing_failed" });
    }

    return response(200, { received: true, result: data });
  } catch (error) {
    console.error("stripe_webhook_unexpected_error", error);
    return response(500, { error: "webhook_internal_error" });
  }
});
