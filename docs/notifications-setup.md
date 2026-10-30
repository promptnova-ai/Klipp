# Klipp notifications setup

This change adds an in-app notification inbox, database-generated booking/chat notifications, a push outbox and an Expo Push dispatcher.

## 1. Apply database migrations

Apply migrations in order, including:

- `024_booking_status_event_history.sql`
- `025_notifications_center_and_push_outbox.sql`

Do not apply them to production until the target Supabase project has been backed up and the migration order has been checked.

## 2. Deploy the dispatcher

Deploy the Edge Function:

```bash
supabase functions deploy dispatch-notifications
```

Set a long random secret (at least 32 bytes) in Supabase Edge Function secrets:

```bash
supabase secrets set NOTIFICATION_CRON_SECRET="<random-secret>"
```

The function has `verify_jwt = false` because scheduled calls authenticate using the dedicated `x-notification-cron-secret` header. Never put this secret in the mobile app or commit it to Git.

## 3. Schedule delivery

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

## 4. Configure mobile push credentials

The app now includes `expo-notifications` and an explicit **Activate push notifications** control in the notification center. The token is registered only after the user grants OS permission and taps that control. On sign-out, the current device token is removed.

Before testing, link the Expo app to its real EAS project and provide its project ID through EAS configuration or `EXPO_PUBLIC_EAS_PROJECT_ID`. Configure Android FCM v1 credentials and the iOS APNs key in the EAS project, then create a new development build:

```bash
cd app
eas build --profile development --platform all
```

Install that build on physical iOS and Android devices, sign in, open **Avisos** and activate push. Remote push is not available in Expo Go on Android; use a development or production build. The in-app inbox works without push credentials.

## 5. Current event coverage

- Booking status transitions: client and professional receive role-specific notices.
- New booking request: assigned professional receives a notice.
- New chat message: the other booking participant receives a notice. Message contents are not copied into push previews.
- User preferences: `booking_updates` and `chat_messages` can control in-app and push channels. Missing preferences default to enabled.
- Every notification has a unique deduplication key. Push delivery is isolated in an outbox so a temporary push-provider outage does not lose the in-app notification.
