import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildAzulRequestAuthHash,
  calculateItbisMinor,
  escapeHtml,
  getAzulConfig,
  getSupabaseServiceConfig,
  toMinorUnits,
  verifyCheckoutToken,
} from "../_shared/azul.ts";

function htmlResponse(content: string, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action https://pruebas.azul.com.do https://pagos.azul.com.do https://contpagos.azul.com.do; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function paymentForm(action: string, fields: Record<string, string>, buttonLabel: string): string {
  const hidden = Object.entries(fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("\n");
  return `<form action="${escapeHtml(action)}" method="post">${hidden}<button type="submit">${escapeHtml(buttonLabel)}</button></form>`;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return htmlResponse("<h1>Método no permitido</h1>", 405);
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) return htmlResponse("<h1>Sesión de pago no válida</h1>", 400);

    const config = getAzulConfig();
    const payload = await verifyCheckoutToken(token, config.checkoutTokenSecret);
    if (!payload) return htmlResponse("<h1>La sesión de pago ha caducado. Vuelve a Klipp para intentarlo otra vez.</h1>", 410);

    const { url: supabaseUrl, serviceRoleKey } = getSupabaseServiceConfig();
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: rows, error: claimError } = await admin.rpc("claim_azul_checkout_session", {
      p_payment_id: payload.paymentId,
      p_session_hash: await (async () => {
        const bytes = new TextEncoder().encode(token);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      })(),
    });
    if (claimError) {
      console.warn("AZUL checkout session claim rejected");
      return htmlResponse("<h1>La sesión de pago ya se utilizó o ha caducado.</h1><p>Vuelve a Klipp para iniciar un nuevo intento.</p>", 410);
    }
    const payment = Array.isArray(rows) ? rows[0] : rows;
    if (!payment || payment.booking_id !== payload.bookingId || payment.payment_id !== payload.paymentId) {
      return htmlResponse("<h1>No se pudo validar la reserva.</h1>", 400);
    }

    const amountMinor = toMinorUnits(Number(payment.amount_dop));
    const itbisMinor = calculateItbisMinor(Number(amountMinor), config);
    const authFields = {
      merchantId: config.merchantId,
      merchantName: config.merchantName,
      merchantType: config.merchantType,
      currencyCode: config.currencyCode,
      orderNumber: payment.provider_order_number,
      amountMinor,
      itbisMinor,
      approvedUrl: config.approvedUrl,
      declinedUrl: config.declinedUrl,
      cancelUrl: config.cancelUrl,
    };
    const authHash = await buildAzulRequestAuthHash(authFields, config.authKey);
    const fields: Record<string, string> = {
      MerchantId: authFields.merchantId,
      MerchantName: authFields.merchantName,
      MerchantType: authFields.merchantType,
      CurrencyCode: authFields.currencyCode,
      OrderNumber: authFields.orderNumber,
      Amount: authFields.amountMinor,
      ITBIS: authFields.itbisMinor,
      ApprovedUrl: authFields.approvedUrl,
      DeclinedUrl: authFields.declinedUrl,
      CancelUrl: authFields.cancelUrl,
      UseCustomField1: "0",
      CustomField1Label: "",
      CustomField1Value: "",
      UseCustomField2: "0",
      CustomField2Label: "",
      CustomField2Value: "",
      ShowTransactionResult: "0",
      Locale: "ES",
      AuthHash: authHash,
    };

    const primary = paymentForm(config.paymentPageUrl, fields, "Pagar de forma segura con AZUL");
    const fallback = config.fallbackPaymentPageUrl !== config.paymentPageUrl
      ? `<p class="muted">Si la página principal no está disponible, usa el sitio alternativo:</p>${paymentForm(config.fallbackPaymentPageUrl, fields, "Usar sitio alternativo de AZUL")}`
      : "";
    return htmlResponse(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pago seguro · Klipp</title><style>body{font-family:system-ui,sans-serif;background:#0a0a0b;color:#fff;display:grid;min-height:100vh;place-items:center;margin:0}.card{max-width:440px;padding:32px;text-align:center}.muted{color:#aaa;font-size:14px;line-height:1.5}button{width:100%;background:#eab308;color:#111;border:0;border-radius:12px;padding:14px 20px;font-weight:700;margin:8px 0}</style></head><body><main class="card"><h1>Pago seguro de Klipp</h1><p class="muted">Total: RD$ ${Number(payment.amount_dop).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p class="muted">Elige la página segura de AZUL. Klipp no recibe ni almacena los datos de tu tarjeta.</p>${primary}${fallback}</main></body></html>`);
  } catch (error) {
    console.error("AZUL hosted checkout page failed", error instanceof Error ? error.message : "unknown error");
    return htmlResponse("<h1>No se pudo abrir el pago.</h1><p>Vuelve a Klipp para iniciar un nuevo intento.</p>", 500);
  }
});
