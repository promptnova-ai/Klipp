create extension if not exists pg_cron;

do $$
declare
  v_existing_job_id bigint;
begin
  select jobid into v_existing_job_id
  from cron.job
  where jobname = 'klipp-dispatch-notifications'
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  perform cron.schedule(
    'klipp-dispatch-notifications',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://hxjwibtpxgpdxemqqwjh.supabase.co/functions/v1/dispatch-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-notification-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'klipp_notification_cron_secret'
            limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
    $job$
  );
end
$$;
