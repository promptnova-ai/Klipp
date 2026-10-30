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
    const accessToken = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonResponse({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleMapsKey = Deno.env.get("GOOGLE_MAPS_SERVER_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }
    if (!googleMapsKey) {
      return jsonResponse({ error: "Route ETA is not configured", code: "GOOGLE_MAPS_KEY_MISSING" }, 503);
    }

    const body = await req.json();
    const bookingId = body?.bookingId;
    if (typeof bookingId !== "string") return jsonResponse({ error: "bookingId is required" }, 400);

    const userClient = createClient(supabaseUrl, anonKey);
    const { data: authResult, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !authResult.user) return jsonResponse({ error: "Invalid session" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, client_id, status, client_lat, client_lng")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return jsonResponse({ error: "Booking not found" }, 404);
    if (booking.client_id !== authResult.user.id) return jsonResponse({ error: "Not allowed" }, 403);
    if (booking.status !== "en_route") return jsonResponse({ error: "Booking is not en route" }, 409);
    if (typeof booking.client_lat !== "number" || typeof booking.client_lng !== "number") {
      return jsonResponse({ error: "Booking destination is unavailable" }, 422);
    }

    const { data: location, error: locationError } = await admin
      .from("pro_locations")
      .select("latitude, longitude, updated_at")
      .eq("booking_id", bookingId)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location || typeof location.latitude !== "number" || typeof location.longitude !== "number") {
      return jsonResponse({ error: "Professional location is not available yet", code: "LOCATION_PENDING" }, 202);
    }

    const locationAgeSeconds = Math.max(0, (Date.now() - new Date(location.updated_at).getTime()) / 1000);
    if (!Number.isFinite(locationAgeSeconds) || locationAgeSeconds > 120) {
      return jsonResponse({
        error: "Professional location is stale",
        code: "LOCATION_STALE",
        locationUpdatedAt: location.updated_at,
        locationAgeSeconds: Math.round(locationAgeSeconds),
      }, 202);
    }

    const routeResponse = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleMapsKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: { latitude: location.latitude, longitude: location.longitude },
          },
        },
        destination: {
          location: {
            latLng: { latitude: booking.client_lat, longitude: booking.client_lng },
          },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        languageCode: "es-DO",
        units: "METRIC",
      }),
    });

    if (!routeResponse.ok) {
      const details = await routeResponse.text();
      console.error("Google Routes API error", routeResponse.status, details.slice(0, 1000));
      return jsonResponse({ error: "Could not calculate route ETA" }, 502);
    }

    const routePayload = await routeResponse.json();
    const route = routePayload?.routes?.[0];
    if (!route || typeof route.duration !== "string" || typeof route.distanceMeters !== "number") {
      return jsonResponse({ error: "No driving route found" }, 404);
    }

    const durationSeconds = Number.parseFloat(route.duration.replace(/s$/, ""));
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return jsonResponse({ error: "Invalid route duration" }, 502);
    }

    const etaMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    const { data: shouldNotifyDelay, error: etaTrackingError } = await admin.rpc("should_notify_booking_eta_delay", {
      p_booking_id: bookingId,
      p_eta_minutes: etaMinutes,
    });
    if (etaTrackingError) {
      console.error("Could not evaluate ETA notification threshold", etaTrackingError);
    } else if (shouldNotifyDelay === true) {
      const { error: notificationError } = await admin.rpc("create_klipp_notification", {
        p_user_id: booking.client_id,
        p_booking_id: bookingId,
        p_type: "eta_delay",
        p_title: "Tu llegada estimada ha cambiado",
        p_body: `El tiempo estimado de llegada ahora es de unos ${etaMinutes} minutos. Puede haber retrasos en el trayecto.`,
        p_data: { bookingId, target: "client", etaMinutes },
        p_dedupe_key: `booking:${bookingId}:eta-delay:${etaMinutes}`,
        p_event_type: "booking_updates",
      });
      if (notificationError) console.error("Could not enqueue ETA delay notification", notificationError);
    }

    return jsonResponse({
      bookingId,
      etaMinutes,
      durationSeconds: Math.round(durationSeconds),
      distanceMeters: route.distanceMeters,
      encodedPolyline: route.polyline?.encodedPolyline ?? null,
      locationUpdatedAt: location.updated_at,
      calculatedAt: new Date().toISOString(),
      trafficAware: true,
    });
  } catch (error) {
    console.error("Booking route ETA failed", error);
    return jsonResponse({ error: "Could not calculate booking ETA" }, 500);
  }
});
