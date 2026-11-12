export type AzulPaymentFields = {
  merchantId: string;
  merchantName: string;
  merchantType: string;
  currencyCode: string;
  orderNumber: string;
  amountMinor: string;
  itbisMinor: string;
  approvedUrl: string;
  declinedUrl: string;
  cancelUrl: string;
};

export type AzulConfig = {
  env: "test" | "production";
  merchantId: string;
  merchantName: string;
  merchantType: string;
  currencyCode: string;
  authKey: string;
  paymentPageUrl: string;
  fallbackPaymentPageUrl: string;
  approvedUrl: string;
  declinedUrl: string;
  cancelUrl: string;
  checkoutPageUrl: string;
  checkoutTokenSecret: string;
  itbisExempt: boolean;
  itbisRate: number | null;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

export function getAzulConfig(): AzulConfig {
  const env = (Deno.env.get("AZUL_ENV") ?? "test").toLowerCase();
  if (env !== "test" && env !== "production") throw new Error("AZUL_ENV must be test or production");
  if (env === "production" && Deno.env.get("AZUL_ENABLE_LIVE_PAYMENTS") !== "true") {
    throw new Error("Live AZUL payments are disabled until merchant certification is complete");
  }

  const checkoutTokenSecret = requiredEnv("AZUL_CHECKOUT_TOKEN_SECRET");
  if (checkoutTokenSecret.length < 32) throw new Error("AZUL_CHECKOUT_TOKEN_SECRET must contain at least 32 characters");
  const itbisExempt = Deno.env.get("AZUL_ITBIS_EXEMPT") === "true";
  const rawRate = Deno.env.get("AZUL_ITBIS_RATE");
  const itbisRate = rawRate ? Number(rawRate) : null;
  if (!itbisExempt && (itbisRate === null || !Number.isFinite(itbisRate) || itbisRate < 0 || itbisRate >= 1)) {
    throw new Error("Set AZUL_ITBIS_RATE or AZUL_ITBIS_EXEMPT=true after fiscal review");
  }

  const defaultPaymentUrl = env === "test"
    ? "https://pruebas.azul.com.do/PaymentPage/"
    : "https://pagos.azul.com.do/PaymentPage/Default.aspx";
  const defaultFallbackUrl = env === "test"
    ? "https://pruebas.azul.com.do/PaymentPage/"
    : "https://contpagos.azul.com.do/PaymentPage/Default.aspx";

  return {
    env,
    merchantId: requiredEnv("AZUL_MERCHANT_ID"),
    merchantName: requiredEnv("AZUL_MERCHANT_NAME"),
    merchantType: requiredEnv("AZUL_MERCHANT_TYPE"),
    currencyCode: requiredEnv("AZUL_CURRENCY_CODE"),
    authKey: requiredEnv("AZUL_AUTH_KEY"),
    paymentPageUrl: Deno.env.get("AZUL_PAYMENT_PAGE_URL")?.trim() || defaultPaymentUrl,
    fallbackPaymentPageUrl: Deno.env.get("AZUL_PAYMENT_PAGE_FALLBACK_URL")?.trim() || defaultFallbackUrl,
    approvedUrl: requiredEnv("AZUL_APPROVED_URL"),
    declinedUrl: requiredEnv("AZUL_DECLINED_URL"),
    cancelUrl: requiredEnv("AZUL_CANCEL_URL"),
    checkoutPageUrl: requiredEnv("AZUL_CHECKOUT_PAGE_URL"),
    checkoutTokenSecret,
    itbisExempt,
    itbisRate,
  };
}

export function toMinorUnits(amountDop: number): string {
  if (!Number.isFinite(amountDop) || amountDop <= 0) throw new Error("Invalid DOP amount");
  return String(Math.round(amountDop * 100));
}

export function calculateItbisMinor(amountMinor: number, config: AzulConfig): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Invalid transaction amount");
  if (config.itbisExempt) return "000";
  const rate = config.itbisRate;
  if (rate === null) throw new Error("ITBIS configuration is missing");
  // AZUL's Amount is the customer total (tax included); ITBIS is its tax component.
  return String(Math.round(amountMinor * rate / (1 + rate))).padStart(3, "0");
}

function utf16le(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2);
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    bytes[i * 2] = code & 0xff;
    bytes[i * 2 + 1] = code >>> 8;
  }
  return bytes;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha512Hex(message: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, utf16le(message)));
}

export async function hmacSha256Hex(message: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message)));
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function createCheckoutToken(
  payload: { paymentId: string; bookingId: string; exp: number; nonce: string },
  secret: string,
): Promise<string> {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256Hex(encoded, secret);
  return `${encoded}.${signature}`;
}

export async function verifyCheckoutToken(
  token: string,
  secret: string,
): Promise<{ paymentId: string; bookingId: string; exp: number; nonce: string } | null> {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = await hmacSha256Hex(encoded, secret);
  if (!constantTimeEquals(signature.toLowerCase(), expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (
      typeof payload.paymentId !== "string" ||
      typeof payload.bookingId !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.nonce !== "string" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildAzulRequestAuthHash(fields: AzulPaymentFields, authKey: string): Promise<string> {
  const message = [
    fields.merchantId,
    fields.merchantName,
    fields.merchantType,
    fields.currencyCode,
    fields.orderNumber,
    fields.amountMinor,
    fields.itbisMinor,
    fields.approvedUrl,
    fields.declinedUrl,
    fields.cancelUrl,
    "0", // UseCustomField1
    "",  // CustomField1Label
    "",  // CustomField1Value
    "0", // UseCustomField2
    "",  // CustomField2Label
    "",  // CustomField2Value
    authKey,
  ].join("");
  return hmacSha512Hex(message, authKey);
}

export async function verifyAzulResponseAuthHash(
  fields: {
    orderNumber: string;
    amountMinor: string;
    authorizationCode: string;
    dateTime: string;
    responseCode: string;
    isoCode: string;
    responseMessage: string;
    errorDescription: string;
    rrn: string;
  },
  receivedHash: string,
  authKey: string,
): Promise<boolean> {
  const message = [
    fields.orderNumber,
    fields.amountMinor,
    fields.authorizationCode,
    fields.dateTime,
    fields.responseCode,
    fields.isoCode,
    fields.responseMessage,
    fields.errorDescription,
    fields.rrn,
    authKey,
  ].join("");
  const expected = await hmacSha512Hex(message, authKey);
  return constantTimeEquals(receivedHash.toLowerCase(), expected);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function getSupabaseServiceConfig() {
  return {
    url: requiredEnv("SUPABASE_URL"),
    anonKey: requiredEnv("SUPABASE_ANON_KEY"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
