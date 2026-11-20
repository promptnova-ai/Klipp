-- QA-only scheduler for expiry/dispatch/reminders and push queue processing.
-- A random secret is generated inside Supabase Vault; it is never stored in source.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'notification_cron_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'notification_cron_secret',
      'Shared secret for scheduled Klipp QA dispatch-notifications calls'
    );
  END IF;
END;
$block$;

CREATE OR REPLACE FUNCTION public.verify_notification_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_secret IS NOT NULL
    AND length(p_secret) = 64
    AND EXISTS (
      SELECT 1
      FROM vault.decrypted_secrets s
      WHERE s.name = 'notification_cron_secret'
        AND s.decrypted_secret = p_secret
    );
$function$;

REVOKE ALL ON FUNCTION public.verify_notification_cron_secret(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_notification_cron_secret(text)
TO service_role;

DO $block$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid FROM cron.job WHERE jobname = 'klipp-qa-dispatch-notifications'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'klipp-qa-dispatch-notifications',
    '* * * * *',
    $job$
      SELECT net.http_post(
        'https://laneosajzwskktschhex.supabase.co/functions/v1/dispatch-notifications',
        '{}'::jsonb,
        '{}'::jsonb,
        jsonb_build_object(
          'Content-Type', 'application/json',
          'x-notification-cron-secret',
          (SELECT decrypted_secret
           FROM vault.decrypted_secrets
           WHERE name = 'notification_cron_secret')
        ),
        10000
      );
    $job$
  );
END;
$block$;
