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
    if (new Date(booking.scheduled_start).getTime() > Date.now() + 20 * 60 * 1000) {
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

  // Create one 45-second offer for every eligible professional. The existing
  // respond_to_request RPC locks the booking and lets only the first valid
  // acceptance win; it expires the other pending requests atomically.
  const offerResults = await Promise.all(candidates.map(async (candidate: { pro_id: string }) => {
    const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_MS).toISOString();
    const { data, error } = await admin
      .from("booking_requests")
      .insert({
        booking_id: bookingId,
        pro_id: candidate.pro_id,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      // Another dispatch worker may have inserted this same booking/pro pair.
      if (error.code === "23505") return null;
      throw error;
    }
    return data?.id ? { id: data.id as string } : null;
  }));

  const requestIds = offerResults.flatMap((result) => result ? [result.id] : []);
  if (!requestIds.length) return;

  const deadline = Date.now() + OFFER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data: currentBooking, error: bookingError } = await admin
      .from("bookings")
      .select("status, pro_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!currentBooking || currentBooking.status !== "requested" || currentBooking.pro_id) return;

    const { data: requests, error: requestsError } = await admin
      .from("booking_requests")
      .select("status")
      .in("id", requestIds);
    if (requestsError) throw requestsError;

    const hasPending = (requests ?? []).some((request) => request.status === "pending");
    const hasAccepted = (requests ?? []).some((request) => request.status === "accepted");
    if (hasAccepted || !hasPending) return;

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Expire only still-pending offers. A concurrent acceptance is protected by
  // the conditional update and by respond_to_request's booking row lock.
  await admin
    .from("booking_requests")
    .update({ status: "expired", responded_at: new Date().toISOString() })
    .in("id", requestIds)
    .eq("status", "pending");
}
