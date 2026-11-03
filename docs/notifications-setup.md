# Klipp notifications setup

This change adds an in-app notification inbox, database-generated booking/chat notifications, a push outbox and an Expo Push dispatcher.

## 1. Apply database migrations

Apply migrations in order, including:

- `024_booking_status_event_history.sql`
- `025_notifications_center_and_push_outbox.sql`
- `029_simultaneous_auto_dispatch.sql`
- `030_professional_variant_pricing_and_7_percent_commission.sql`
- `031_uber_style_incoming_offer.sql`
- `032_set_seven_percent_on_all_booking_creation_paths.sql`

Do not apply them to production until the target Supabase project has been backed up and the migration order has been checked.

## 2. Deploy the dispatcher

Deploy the Edge Function:

```bash
supabase functions deploy dispatch-notifications
```

Set a long random secret (at least 32 bytes) in Supabase Edge Function secrets. The traffic-aware arrival estimate also requires the server-side Google Routes API key:

```bash
supabase secrets set NOTIFICATION_CRON_SECRET="<random-secret>" GOOGLE_MAPS_SERVER_API_KEY="<server-google-routes-key>"
```

The function validates either the service-role bearer token or the dedicated `x-notification-cron-secret` header itself. It is deployed with JWT gateway verification disabled so scheduled calls can authenticate with that server-only header. Never put this secret in the mobile app or commit it to Git.

## 3. Trigger urgent offers immediately

A once-per-minute worker is too slow for the 45-second professional offer. In Supabase Dashboard → Database → Webhooks, create a webhook with these settings:

- Table: `public.push_delivery_queue`
- Events: `INSERT`
- Type: HTTP Request, method `POST`
- URL: `https://<project-ref>.supabase.co/functions/v1/dispatch-notifications`
- Headers: `Content-Type: application/json` and `x-notification-cron-secret: <same NOTIFICATION_CRON_SECRET>`
- Body: send the inserted row payload (the dispatcher claims all pending queue rows; the body is not used).

Keep the secret server-side. Do not put it in the app or a public environment variable. Test a new notification on a physical device with the app in background and closed, and confirm it arrives before the 45-second countdown expires.

## 4. Schedule reminders and ETA monitoring

Enable the `pg_cron`, `pg_net` and `vault` extensions in the Supabase project. In the SQL Editor, create two Vault secrets, replacing the placeholders with the project's URL and the same random secret configured above:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co',
  'klipp_project_url'
);

select vault.create_secret(
  '<same-random-secret>',
  'klipp_notification_cron_secret'
);
```

Then schedule the dispatcher once per minute:

```sql
select cron.schedule(
  'klipp-dispatch-notifications',
  '* * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'klipp_project_url'
      ) || '/functions/v1/dispatch-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notification-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'klipp_notification_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $$
);
```

Check the job in Supabase Dashboard → Integrations → Cron. The worker claims a limited batch, uses Expo Push Service and checks Expo receipts after 15 minutes. Invalid device tokens are removed when Expo reports `DeviceNotRegistered`.

## 5. Configure mobile push credentials

The app now includes `expo-notifications` and an explicit **Activate push notifications** control in the notification center. The token is registered only after the user grants OS permission and taps that control. On sign-out, the current device token is removed.

Before testing, link the Expo app to its real EAS project and provide its project ID through EAS configuration or `EXPO_PUBLIC_EAS_PROJECT_ID`. Configure Android FCM v1 credentials and the iOS APNs key in the EAS project, then create a new development build:

```bash
cd app
eas build --profile development --platform all
```

Install that build on physical iOS and Android devices, sign in, open **Avisos** and activate push. Remote push is not available in Expo Go on Android; use a development or production build. The in-app inbox works without push credentials.

## 6. Current event coverage

- Booking status transitions: client and professional receive role-specific notices.
- Payment events: failed payments warn both parties not to proceed until confirmation; refunds notify the client; released payouts notify the professional.
- New review: the professional receives a notice.
- Support issue resolved: the person who reported it receives a notice.
- New booking request: assigned professional receives a notice. For manual selection, a decline or timeout also notifies the client so they can choose another professional. Automatic dispatch declines stay quiet while Klipp tries the next candidate.
- New chat message: the other booking participant receives a notice. Message contents are not copied into push previews.
- Scheduled service reminders: the dispatcher generates 24-hour and one-hour reminders for both booking participants, with deduplication keys.
- ETA delays: the scheduled worker refreshes active-trip routes approximately every three minutes when the professional GPS is no older than two minutes. If the traffic-aware ETA increases by at least 10 minutes from the last notification baseline, the client receives one update. Improvements of 10 minutes reset the baseline without sending a push, preventing repeated alerts. Route refreshes incur Google Routes API usage; monitor the Google Cloud billing and quota.
- User preferences: `booking_updates` and `chat_messages` can control in-app and push channels. Missing preferences default to enabled.
- Every notification has a unique deduplication key. Push delivery is isolated in an outbox so a temporary push-provider outage does not lose the in-app notification.


## 7. Incoming professional offers (Uber-style)

When a professional receives a pending `booking_request`, the app displays a full-screen offer with a 45-second countdown. The screen includes the customer's display name, service and variant, service address and reference, scheduled time, estimated duration, and the professional's expected payout. The professional accepts by sliding the control to the end or declines using the separate reject action.

The request details are returned by `pro_list_incoming_booking_requests()`. This is a security-definer RPC that only returns pending, unexpired requests belonging to the signed-in professional. Do not loosen the general `profiles` or `bookings` row-level security policies to expose client details globally.

Android devices register a dedicated `klipp-requests` notification channel with maximum importance, sound and vibration. The app also presents notifications while in the foreground.

**Important delivery timing:** the existing example dispatcher schedule above runs once per minute. That schedule is not fast enough to guarantee delivery of a push notification before a 45-second offer expires. Realtime updates display the offer promptly while the professional app is connected. For reliable background/closed-app alerts, configure an immediate Database Webhook (or another supported sub-minute trigger) on new `push_delivery_queue` rows to invoke `dispatch-notifications`, authenticated with the same server-only secret. Do not rely on the once-per-minute reminder schedule for urgent offers. Verify delivery latency on physical Android and iOS devices before launch.
