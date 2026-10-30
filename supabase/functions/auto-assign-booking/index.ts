import { createClient } from "npm:@supabase/supabase-js@2";

const OFFER_TIMEOUT_MS = 45000;
const POLL_INTERVAL_MS = 1500;
const MAX_CANDIDATES = 5;

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
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Supabase function environment is incomplete");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const { bookingId } = await req.json();
    if (typeof bookingId !== "string") return jsonResponse({ error: "bookingId is required" }, 400);

    const userClient = createClient(supabaseUrl, anonKey);
    const { data: userResult, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !userResult.user) return jsonResponse({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("client_id, assignment_mode, status, pro_id, scheduled_start")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) return jsonResponse({ error: "Booking not found" }, 404);
    if (booking.client_id !== userResult.user.id) return jsonResponse({ error: "Not allowed" }, 403);
    if (booking.assignment_mode !== "auto") return jsonResponse({ error: "Booking is not automatic" }, 400);
    if (booking.status !== "requested" || booking.pro_id) {
      return jsonResponse({ error: "Booking is no longer available for assignment" }, 409);
    }
    if (new Date(booking.scheduled_start).getTime() > Date.now() + 5 * 60 * 1000) {
      return jsonResponse({ success: true, status: "on_hold" }, 202);
    }

    const { data: pendingRequests, error: pendingError } = await admin
      .from("booking_requests")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .limit(1);
    if (pendingError) throw pendingError;
    if (pendingRequests?.length) return jsonResponse({ success: true, status: "searching" }, 202);

    EdgeRuntime.waitUntil(
      runAssignment(admin, bookingId).catch(async (error: unknown) => {
        console.error("Automatic assignment failed", error);
        await admin
          .from("bookings")
          .update({ status: "expired" })
          .eq("id", bookingId)
          .eq("status", "requested");
      }),
    );

    return jsonResponse({ success: true, status: "searching" }, 202);
  } catch (error) {
    console.error("Could not start automatic assignment", error);
    return jsonResponse({ error: "Could not start automatic assignment" }, 500);
  }
});

async function runAssignment(admin: ReturnType<typeof createClient>, bookingId: string) {
  const { data: candidates, error: candidatesError } = await admin.rpc(
    "find_auto_candidates",
    { p_booking_id: bookingId, p_limit: MAX_CANDIDATES },
  );
  if (candidatesError) throw candidatesError;

  if (!candidates?.length) return;

  for (const candidate of candidates) {
    const { data: currentBooking, error: currentBookingError } = await admin
      .from("bookings")
      .select("status, pro_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (currentBookingError) throw currentBookingError;
    if (!currentBooking || currentBooking.status !== "requested" || currentBooking.pro_id) return;

    const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS).toISOString();
    const { data: request, error: requestError } = await admin
      .from("booking_requests")
      .insert({ booking_id: bookingId, pro_id: candidate.pro_id, expires_at: expiresAt })
      .select("id")
      .single();
    if (requestError) {
      if (requestError.code === "23505") continue;
      throw requestError;
    }

    const deadline = Date.now() + OFFER_TIMEOUT_MS;
    let responseStatus = "pending";
    while (Date.now() < deadline) {
      const { data: latestRequest, error: latestRequestError } = await admin
        .from("booking_requests")
        .select("status")
        .eq("id", request.id)
        .maybeSingle();
      if (latestRequestError) throw latestRequestError;
      responseStatus = latestRequest?.status ?? "expired";

      if (responseStatus === "accepted") return;
      if (responseStatus !== "pending") break;

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (responseStatus === "pending") {
      await admin
        .from("booking_requests")
        .update({ status: "expired", responded_at: new Date().toISOString() })
        .eq("id", request.id)
        .eq("status", "pending");
    }
  }

  // Leave the booking requested; the scheduled dispatcher will retry with fresh presence data.
}
