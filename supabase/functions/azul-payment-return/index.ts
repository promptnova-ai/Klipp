import { createClient } from "npm:@supabase/supabase-js@2";
import {
  getAzulConfig,
  getSupabaseServiceConfig,
  verifyAzulResponseAuthHash,
} from "../_shared/azul.ts";

function htmlResponse(content: string, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function getField(params: URLSearchParams, name: string): string {
  const exact = params.get(name);
  if (exact !== null) return exact;
  const match = [...params.entries()].find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1] ?? "";
}

function returnPage(heading: string, message: string, bookingId?: string): string {
  const webBase = (Deno.env.get("KLIPP_WEB_APP_URL") ?? "https://klipp-seven.vercel.app").replace(/\/$/, "");
  const bookingUrl = bookingId ? `${webBase}/(client)/bookings?bookingId=${encodeURIComponent(bookingId)}` : webBase;
  const appUrl = bookingId ? `klipp:///(client)/bookings?bookingId=${encodeURIComponent(bookingId)}` : "klipp://";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Klipp · Estado del pago</title><style>body{font-family:system-ui,sans-serif;background:#0a0a0b;color:#fff;display:grid;min-height:100vh;place-items:center;margin:0}.card{max-width:440px;padding:32px;text-align:center}.muted{color:#aaa;line-height:1.5}a{display:block;margin:14px 0;background:#eab308;color:#111;text-decoration:none;border-radius:12px;padding:14px 20px;font-weight:700}</style></head><body><main class="card"><h1>${heading}</h1><p class="muted">${message}</p><a href="${appUrl}">Volver a la aplicación Klipp</a><a href="${bookingUrl}">Abrir Mis reservas</a></main></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return htmlResponse(returnPage("Solicitud no válida", "Vuelve a Klipp para revisar tu reserva."), 405);
  }

  try {
    const params = req.method === "POST"
      ? new URLSearchParams(await req.text())
      : new URL(req.url).searchParams;

    // AZUL's CancelUrl may return without transaction parameters. Do not mark
    // payment failed from this unsigned browser navigation; expiry/retry logic
    // owns the pending attempt.
    const orderNumber = getField(params, "OrderNumber");
    if (!orderNumber) {
      return htmlResponse(returnPage("Pago cancelado", "No se ha confirmado ningún cobro. Puedes volver a Klipp y reintentar mientras la reserva siga vigente."));
    }

    const config = getAzulConfig();
    const responseFields = {
      orderNumber,
      amountMinor: getField(params, "Amount"),
      authorizationCode: getField(params, "AuthorizationCode"),
      dateTime: getField(params, "DateTime"),
      responseCode: getField(params, "ResponseCode"),
      isoCode: getField(params, "IsoCode"),
      responseMessage: getField(params, "ResponseMessage"),
      errorDescription: getField(params, "ErrorDescription"),
      rrn: getField(params, "RRN"),
    };
    const receivedHash = getField(params, "AuthHash");
    if (!receivedHash || !responseFields.amountMinor || !/^\d+$/.test(responseFields.amountMinor)) {
      return htmlResponse(returnPage("No se pudo verificar el pago", "La respuesta recibida no contiene los datos necesarios. No se ha activado la reserva."), 400);
    }
    const signatureValid = await verifyAzulResponseAuthHash(responseFields, receivedHash, config.authKey);
    if (!signatureValid) {
      console.error("AZUL callback signature validation failed");
      return htmlResponse(returnPage("No se pudo verificar el pago", "La firma de la respuesta no es válida. No se ha activado la reserva."), 400);
    }

    const { url, serviceRoleKey } = getSupabaseServiceConfig();
    const admin = createClient(url, serviceRoleKey);
    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id, booking_id, amount_dop, currency_code, status, refund_required_at, refund_reason, provider_amount_dop")
      .eq("provider", "azul")
      .eq("provider_order_number", orderNumber)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return htmlResponse(returnPage("Pago no reconocido", "No encontramos una reserva asociada a esta operación."), 404);

    const amountDop = Number(responseFields.amountMinor) / 100;
    if (!Number.isFinite(amountDop) || amountDop < 0) {
      return htmlResponse(returnPage("Respuesta de pago no válida", "No se pudo interpretar el importe recibido. La reserva no se ha activado."), 400);
    }

    const normalizedCode = responseFields.responseCode === "00" && responseFields.isoCode === "00"
      ? "00"
      : `DECLINED_${responseFields.responseCode || responseFields.isoCode || "UNKNOWN"}`;
    const { error: finalizeError } = await admin.rpc("finalize_azul_payment_attempt", {
      p_payment_id: payment.id,
      p_provider_order_number: orderNumber,
      p_amount_dop: amountDop,
      p_response_code: normalizedCode,
      p_authorization_code: responseFields.authorizationCode || null,
      p_rrn: responseFields.rrn || null,
      p_auth_hash_verified: true,
    });
    if (finalizeError) {
      console.error("AZUL callback finalization rejected", finalizeError.message);
      return htmlResponse(returnPage("Pago pendiente de validación", "No se ha podido confirmar el resultado. Revisa Mis reservas antes de volver a intentarlo.", payment.booking_id), 409);
    }

    const [{ data: paymentOutcome, error: outcomeError }, { data: bookingOutcome, error: bookingOutcomeError }] = await Promise.all([
      admin.from("payments")
        .select("status, refund_required_at, refund_reason, provider_amount_dop")
        .eq("id", payment.id)
        .single(),
      admin.from("bookings")
        .select("status")
        .eq("id", payment.booking_id)
        .single(),
    ]);
    if (outcomeError || bookingOutcomeError) throw outcomeError ?? bookingOutcomeError;

    if (paymentOutcome.refund_required_at) {
      return htmlResponse(returnPage(
        "Pago recibido · revisión necesaria",
        "AZUL confirmó el cobro, pero no coincide con las condiciones de la reserva o llegó fuera de plazo. No se ha enviado ninguna solicitud al profesional y el importe queda pendiente de revisión para su devolución.",
        payment.booking_id,
      ));
    }
    if (paymentOutcome.status === "held" && ["requested", "scheduled"].includes(bookingOutcome.status)) {
      return htmlResponse(returnPage("Pago recibido", "Tu reserva se ha activado. Klipp ya puede enviar la solicitud al profesional.", payment.booking_id));
    }
    return htmlResponse(returnPage("Pago no completado", "AZUL no aprobó el pago. No se ha enviado ninguna solicitud al profesional. Puedes reintentarlo desde Mis reservas.", payment.booking_id));
  } catch (error) {
    console.error("AZUL payment return failed", error instanceof Error ? error.message : "unknown error");
    return htmlResponse(returnPage("No se pudo actualizar el pago", "Vuelve a Klipp y revisa el estado de tu reserva."), 500);
  }
});
