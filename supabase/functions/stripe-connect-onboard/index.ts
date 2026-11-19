import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing server configuration: ${key}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });
    const supabaseUrl = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return json(401, { error: "invalid_session" });

    const { data: pro, error: proError } = await userClient
      .from("pro_profiles").select("user_id").eq("user_id", auth.user.id).maybeSingle();
    if (proError || !pro) return json(403, { error: "professional_account_required" });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
    const country = typeof body.country === "string" ? body.country.toUpperCase() : "";
    if (!/^[A-Z]{2}$/.test(country)) return json(400, { error: "invalid_country" });

    const allowed = (Deno.env.get("STRIPE_CONNECT_ALLOWED_COUNTRIES") ?? "")
      .split(",").map((v) => v.trim().toUpperCase()).filter(Boolean);
    if (!allowed.includes(country)) {
      return json(422, {
        error: "connect_country_not_enabled",
        message: "Este país no está habilitado para pagos a profesionales en Klipp.",
      });
    }

    const stripe = new Stripe(env("STRIPE_SECRET_KEY"), {
      httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 20000,
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existing, error: existingError } = await service
      .from("stripe_connected_accounts").select("stripe_account_id,country_code")
      .eq("pro_id", auth.user.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.country_code !== country) {
      return json(409, { error: "connected_account_country_immutable" });
    }

    let account: Stripe.Account;
    if (existing?.stripe_account_id) {
      account = await stripe.accounts.retrieve(existing.stripe_account_id);
    } else {
      account = await stripe.accounts.create({
        type: "express",
        country,
        email: auth.user.email ?? undefined,
        business_type: "individual",
        capabilities: { transfers: { requested: true } },
        metadata: { klipp_pro_user_id: auth.user.id, klipp_platform: "klipp" },
      }, { idempotencyKey: `klipp-connect-account-${auth.user.id}` });
    }

    const requirements = account.requirements;
    const { error: saveError } = await service.rpc("upsert_stripe_connected_account", {
      p_pro_id: auth.user.id,
      p_account_id: account.id,
      p_country_code: account.country,
      p_details_submitted: account.details_submitted,
      p_charges_enabled: account.charges_enabled,
      p_payouts_enabled: account.payouts_enabled,
      p_transfers_capability: account.capabilities?.transfers ?? null,
      p_currently_due: requirements?.currently_due ?? [],
      p_past_due: requirements?.past_due ?? [],
      p_disabled_reason: requirements?.disabled_reason ?? null,
    });
    if (saveError) throw saveError;

    const baseUrl = env("KLIPP_PUBLIC_URL").replace(/\/$/, "");
    const link = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${baseUrl}/payments/connect/refresh`,
      return_url: `${baseUrl}/payments/connect/return`,
      type: "account_onboarding",
    });
    return json(200, {
      onboardingUrl: link.url,
      expiresAt: link.expires_at,
      accountId: account.id,
      country: account.country,
      payoutsEnabled: account.payouts_enabled,
    });
  } catch (error) {
    console.error("stripe_connect_onboard_failed", error);
    return json(500, { error: "connect_onboarding_failed" });
  }
});
