create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.notification_webhook_secret (
  singleton boolean primary key default true check (singleton),
  secret_hash bytea not null,
  updated_at timestamptz not null default now()
);
revoke all on private.notification_webhook_secret from public, anon, authenticated, service_role;

do $$
declare
  v_secret text;
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'klipp_notification_cron_secret'
  ) then
    v_secret := encode(extensions.gen_random_bytes(48), 'hex');
    perform vault.create_secret(
      v_secret,
      'klipp_notification_cron_secret',
      'Server-only credential for urgent Klipp push dispatch webhook'
    );
    insert into private.notification_webhook_secret(singleton, secret_hash)
    values (true, extensions.digest(v_secret, 'sha256'))
    on conflict (singleton) do update
      set secret_hash = excluded.secret_hash, updated_at = now();
  end if;
end
$$;

create or replace function public.verify_notification_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private, extensions
as $$
  select coalesce(
    p_secret is not null
    and exists (
      select 1
      from private.notification_webhook_secret
      where singleton = true
        and secret_hash = extensions.digest(p_secret, 'sha256')
    ),
    false
  );
$$;
revoke all on function public.verify_notification_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_notification_cron_secret(text) to service_role;

create or replace function public.trigger_klipp_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $$
declare
  v_secret text;
begin
  select decrypted_secret
    into v_secret
  from vault.decrypted_secrets
  where name = 'klipp_notification_cron_secret'
  limit 1;

  if v_secret is null then
    raise warning 'Klipp notification dispatch secret is not configured in Vault';
    return new;
  end if;

  perform net.http_post(
    url := 'https://hxjwibtpxgpdxemqqwjh.supabase.co/functions/v1/dispatch-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notification-cron-secret', v_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'push_delivery_queue',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    ),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;
revoke all on function public.trigger_klipp_push_dispatch() from public, anon, authenticated;

drop trigger if exists push_delivery_queue_dispatch_immediately on public.push_delivery_queue;
create trigger push_delivery_queue_dispatch_immediately
  after insert on public.push_delivery_queue
  for each row execute function public.trigger_klipp_push_dispatch();
