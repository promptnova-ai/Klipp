import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-notification-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ClaimedDelivery = { queue_id: string; notification_id: string; attempts: number };
type ExpoTicket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };
type TicketMapItem = { id: string; token: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("NOTIFICATION_CRON_SECRET");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Server configuration error" }, 500);

  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const isServiceRole = bearer === serviceRoleKey;
  const isScheduledCall = Boolean(cronSecret) && req.headers.get("x-notification-cron-secret") === cronSecret;
  if (!isServiceRole && !isScheduledCall) return jsonResponse({ error: "Not authorized" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const summary = { remindersProcessed: 0, claimed: 0, submitted: 0, skippedWithoutDevice: 0, retried: 0, failed: 0, receiptsChecked: 0, invalidTokensRemoved: 0 };

  try {
    const now = Date.now();
    const reminderWindows = [
      {
        key: "24h",
        from: new Date(now + 23 * 60 * 60_000).toISOString(),
        to: new Date(now + 24 * 60 * 60_000).toISOString(),
        title: "Tu servicio es mañana",
        body: "Recuerda que tienes un servicio Klipp programado para las próximas 24 horas.",
      },
      {
        key: "1h",
        from: new Date(now + 55 * 60_000).toISOString(),
        to: new Date(now + 60 * 60_000).toISOString(),
        title: "Tu servicio comienza pronto",
        body: "Tu servicio Klipp está programado para aproximadamente dentro de una hora.",
      },
    ];

    for (const reminder of reminderWindows) {
      const { data: upcomingBookings, error: reminderQueryError } = await admin
        .from("bookings")
        .select("id, client_id, pro_id, scheduled_start")
        .eq("status", "scheduled")
        .gt("scheduled_start", reminder.from)
        .lte("scheduled_start", reminder.to)
        .limit(100);
      if (reminderQueryError) throw reminderQueryError;

      for (const booking of upcomingBookings ?? []) {
        const recipients = [
          { userId: booking.client_id, target: "client" },
          ...(booking.pro_id ? [{ userId: booking.pro_id, target: "pro" }] : []),
        ];
        for (const recipient of recipients) {
          const { error: createReminderError } = await admin.rpc("create_klipp_notification", {
            p_user_id: recipient.userId,
            p_booking_id: booking.id,
            p_type: "booking_reminder",
            p_title: reminder.title,
            p_body: reminder.body,
            p_data: { bookingId: booking.id, target: recipient.target, reminder: reminder.key },
            p_dedupe_key: `booking:${booking.id}:reminder:${reminder.key}:${recipient.target}`,
            p_event_type: "reminders",
          });
          if (createReminderError) throw createReminderError;
          summary.remindersProcessed += 1;
        }
      }
    }

    const { data: claimedRows, error: claimError } = await admin.rpc("claim_klipp_push_deliveries", { p_limit: 50 });
    if (claimError) throw claimError;
    const claimed = (claimedRows ?? []) as ClaimedDelivery[];
    summary.claimed = claimed.length;

    for (const item of claimed) {
      const { data: notification, error: notificationError } = await admin
        .from("notifications")
        .select("id, user_id, title, body, data")
        .eq("id", item.notification_id)
        .maybeSingle();
      if (notificationError || !notification) {
        await admin.from("push_delivery_queue").update({
          status: item.attempts >= 5 ? "failed" : "pending",
          claimed_at: null,
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
          last_error: notificationError?.message ?? "Notification not found",
        }).eq("id", item.queue_id);
        summary.failed += 1;
        continue;
      }

      const eventType = notification.type === "chat_message" ? "chat_messages" : notification.type === "booking_reminder" ? "reminders" : "booking_updates";
      const { data: preference } = await admin
        .from("notification_preferences")
        .select("push_enabled")
        .eq("user_id", notification.user_id)
        .eq("event_type", eventType)
        .maybeSingle();
      if (preference?.push_enabled === false) {
        await admin.from("push_delivery_queue").update({
          status: "sent",
          claimed_at: null,
          ticket_map: [],
          receipts_checked_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          last_error: "Push delivery disabled by the recipient.",
        }).eq("id", item.queue_id);
        continue;
      }

      const { data: devices, error: devicesError } = await admin
        .from("notification_devices")
        .select("id, expo_push_token")
        .eq("user_id", notification.user_id);
      if (devicesError) {
        await admin.from("push_delivery_queue").update({
          status: item.attempts >= 5 ? "failed" : "pending",
          claimed_at: null,
          next_attempt_at: new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** item.attempts)).toISOString(),
          last_error: devicesError.message,
        }).eq("id", item.queue_id);
        summary.retried += 1;
        continue;
      }

      if (!devices?.length) {
        await admin.from("push_delivery_queue").update({
          status: "sent",
          ticket_map: [],
          receipts_checked_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          last_error: "No registered push devices; notification remains available in the in-app inbox.",
        }).eq("id", item.queue_id);
        summary.skippedWithoutDevice += 1;
        continue;
      }

      const messages = devices.map((device) => ({
        to: device.expo_push_token,
        sound: "default",
        title: notification.title,
        body: notification.body,
        data: { ...(notification.data ?? {}), notificationId: notification.id },
        priority: "high",
        channelId: "klipp-updates",
      }));

      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(messages),
        });
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload?.data)) {
          throw new Error(payload?.errors?.[0]?.message ?? `Expo Push API returned HTTP ${response.status}`);
        }

        const tickets = payload.data as ExpoTicket[];
        const ticketMap: TicketMapItem[] = [];
        const permanentErrors: string[] = [];
        for (let index = 0; index < tickets.length; index += 1) {
          const ticket = tickets[index];
          const device = devices[index];
          if (ticket?.status === "ok" && ticket.id && device) {
            ticketMap.push({ id: ticket.id, token: device.expo_push_token });
          } else if (ticket?.details?.error === "DeviceNotRegistered" && device) {
            await admin.from("notification_devices").delete().eq("id", device.id);
            summary.invalidTokensRemoved += 1;
          } else if (ticket?.status === "error") {
            permanentErrors.push(ticket.message ?? "Expo rejected a push notification");
          }
        }

        const allRejected = ticketMap.length === 0 && permanentErrors.length > 0;
        const shouldRetry = allRejected && item.attempts < 5;
        await admin.from("push_delivery_queue").update({
          status: shouldRetry ? "pending" : allRejected ? "failed" : "sent",
          claimed_at: null,
          next_attempt_at: shouldRetry ? new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** item.attempts)).toISOString() : new Date().toISOString(),
          ticket_map: ticketMap,
          receipts_checked_at: ticketMap.length === 0 ? new Date().toISOString() : null,
          sent_at: ticketMap.length > 0 ? new Date().toISOString() : null,
          last_error: permanentErrors.length ? permanentErrors.join("; ").slice(0, 1500) : null,
        }).eq("id", item.queue_id);

        if (shouldRetry) summary.retried += 1;
        else if (ticketMap.length > 0) summary.submitted += ticketMap.length;
        else summary.failed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Expo Push API error";
        const shouldRetry = item.attempts < 5;
        await admin.from("push_delivery_queue").update({
          status: shouldRetry ? "pending" : "failed",
          claimed_at: null,
          next_attempt_at: new Date(Date.now() + Math.min(60 * 60_000, 30_000 * 2 ** item.attempts)).toISOString(),
          last_error: message.slice(0, 1500),
        }).eq("id", item.queue_id);
        if (shouldRetry) summary.retried += 1;
        else summary.failed += 1;
      }
    }

    // Expo recommends checking push receipts after allowing time for APNs/FCM handoff.
    const receiptCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: receiptRows, error: receiptQueryError } = await admin
      .from("push_delivery_queue")
      .select("id, ticket_map")
      .eq("status", "sent")
      .is("receipts_checked_at", null)
      .lte("sent_at", receiptCutoff)
      .limit(50);
    if (receiptQueryError) throw receiptQueryError;

    for (const row of receiptRows ?? []) {
      const ticketMap = (row.ticket_map ?? []) as TicketMapItem[];
      if (!ticketMap.length) {
        await admin.from("push_delivery_queue").update({ receipts_checked_at: new Date().toISOString() }).eq("id", row.id);
        continue;
      }
      const ids = ticketMap.map((ticket) => ticket.id);
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ids }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.errors?.[0]?.message ?? `Expo receipts returned HTTP ${response.status}`);

        const receiptErrors: string[] = [];
        for (const ticket of ticketMap) {
          const receipt = payload?.data?.[ticket.id];
          if (receipt?.details?.error === "DeviceNotRegistered") {
            await admin.from("notification_devices").delete().eq("expo_push_token", ticket.token);
            summary.invalidTokensRemoved += 1;
          } else if (receipt?.status === "error") {
            receiptErrors.push(receipt.message ?? "Push receipt reported an error");
          }
        }
        await admin.from("push_delivery_queue").update({
          receipts_checked_at: new Date().toISOString(),
          last_error: receiptErrors.length ? receiptErrors.join("; ").slice(0, 1500) : null,
        }).eq("id", row.id);
        summary.receiptsChecked += 1;
      } catch (error) {
        console.error("Push receipt check failed", row.id, error);
      }
    }

    return jsonResponse({ ok: true, ...summary });
  } catch (error) {
    console.error("Notification dispatch failed", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Notification dispatch failed", ...summary }, 500);
  }
});
