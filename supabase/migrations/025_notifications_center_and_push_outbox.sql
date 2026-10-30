-- Klipp notification center, per-user preferences and reliable push outbox.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  show_in_app boolean not null default true,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  dedupe_key text not null unique
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null and show_in_app = true;

create table if not exists public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('booking_updates', 'chat_messages', 'reminders', 'marketing')),
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_type)
);

create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  device_name text,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists notification_devices_user_idx
  on public.notification_devices (user_id);

create table if not exists public.push_delivery_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  ticket_map jsonb not null default '[]'::jsonb,
  receipts_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists push_delivery_queue_pending_idx
  on public.push_delivery_queue (next_attempt_at, created_at)
  where status = 'pending';
create index if not exists push_delivery_queue_receipts_idx
  on public.push_delivery_queue (sent_at)
  where status = 'sent' and receipts_checked_at is null;

alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_devices enable row level security;
alter table public.push_delivery_queue enable row level security;

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and show_in_app = true);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and show_in_app = true)
  with check (user_id = (select auth.uid()) and show_in_app = true);

drop policy if exists notification_preferences_read_own on public.notification_preferences;
create policy notification_preferences_read_own on public.notification_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notification_devices_read_own on public.notification_devices;
create policy notification_devices_read_own on public.notification_devices
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notification_devices_insert_own on public.notification_devices;
create policy notification_devices_insert_own on public.notification_devices
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists notification_devices_update_own on public.notification_devices;
create policy notification_devices_update_own on public.notification_devices
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists notification_devices_delete_own on public.notification_devices;
create policy notification_devices_delete_own on public.notification_devices
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.notification_devices to authenticated;
revoke all on public.push_delivery_queue from anon, authenticated;
grant select on public.notifications, public.notification_preferences to service_role;
grant select, delete on public.notification_devices to service_role;
grant select, update on public.push_delivery_queue to service_role;

create or replace function public.create_klipp_notification(
  p_user_id uuid,
  p_booking_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb,
  p_dedupe_key text,
  p_event_type text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
  v_in_app boolean;
  v_push boolean;
begin
  if p_user_id is null then return; end if;

  select coalesce(np.in_app_enabled, true), coalesce(np.push_enabled, true)
    into v_in_app, v_push
  from (select 1) seed
  left join public.notification_preferences np
    on np.user_id = p_user_id and np.event_type = p_event_type;

  insert into public.notifications (
    user_id, booking_id, type, title, body, data, show_in_app, dedupe_key
  ) values (
    p_user_id, p_booking_id, p_type, p_title, p_body,
    coalesce(p_data, '{}'::jsonb), v_in_app, p_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into v_notification_id;

  if v_notification_id is not null and v_push then
    insert into public.push_delivery_queue (notification_id)
    values (v_notification_id)
    on conflict (notification_id) do nothing;
  end if;
end;
$$;
revoke all on function public.create_klipp_notification(uuid, uuid, text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.create_klipp_notification(uuid, uuid, text, text, text, jsonb, text, text) to service_role;

create or replace function public.notify_klipp_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_client_title text;
  v_client_body text;
  v_pro_title text;
  v_pro_body text;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found then return new; end if;

  case new.to_status
    when 'requested' then
      v_client_title := 'Solicitud enviada';
      v_client_body := 'Tu solicitud de servicio se ha registrado en Klipp.';
    when 'awaiting_payment' then
      v_client_title := 'Pago pendiente';
      v_client_body := 'Un profesional ha aceptado tu solicitud. Completa el pago para confirmar la reserva.';
      v_pro_title := 'Solicitud aceptada';
      v_pro_body := 'Has aceptado el servicio. Estamos esperando la confirmación del pago del cliente.';
    when 'scheduled' then
      v_client_title := 'Reserva confirmada';
      v_client_body := 'Tu servicio está confirmado. Consulta los detalles en Mis reservas.';
      v_pro_title := 'Servicio confirmado';
      v_pro_body := 'La reserva está confirmada y aparece en tu agenda.';
    when 'en_route' then
      v_client_title := 'Tu profesional va en camino';
      v_client_body := 'Ya puedes seguir su ubicación y consultar la llegada estimada en Klipp.';
    when 'arrived' then
      v_client_title := 'Tu profesional ha llegado';
      v_client_body := 'El profesional ha indicado que llegó al domicilio.';
    when 'in_progress' then
      v_client_title := 'Tu servicio ha comenzado';
      v_client_body := 'El profesional ha iniciado el trabajo.';
      v_pro_title := 'Servicio iniciado';
      v_pro_body := 'El servicio está en curso. Recuerda actualizar el estado al terminar.';
    when 'completed' then
      v_client_title := 'Servicio terminado';
      v_client_body := 'El profesional ha marcado el servicio como terminado. Revisa y confirma cuando corresponda.';
      v_pro_title := 'Servicio marcado como terminado';
      v_pro_body := 'El cliente ya puede revisar y confirmar el servicio.';
    when 'confirmed' then
      v_pro_title := 'Servicio confirmado por el cliente';
      v_pro_body := 'El cliente ha confirmado el servicio. Gracias por trabajar con Klipp.';
    when 'cancelled' then
      v_client_title := 'Reserva cancelada';
      v_client_body := 'La reserva ha sido cancelada. Consulta el detalle para conocer el siguiente paso.';
      v_pro_title := 'Reserva cancelada';
      v_pro_body := 'Una reserva asignada a tu cuenta ha sido cancelada.';
    when 'disputed' then
      v_client_title := 'Incidencia registrada';
      v_client_body := 'Hemos recibido una incidencia sobre este servicio. Te informaremos de los siguientes pasos.';
      v_pro_title := 'Incidencia en una reserva';
      v_pro_body := 'Se ha registrado una incidencia relacionada con este servicio.';
    when 'expired' then
      v_client_title := 'Solicitud expirada';
      v_client_body := 'No se pudo confirmar un profesional para esta solicitud. Puedes volver a intentarlo.';
    else
      return new;
  end case;

  perform public.create_klipp_notification(
    v_booking.client_id, v_booking.id, 'booking_status', v_client_title, v_client_body,
    jsonb_build_object('bookingId', v_booking.id, 'status', new.to_status, 'target', 'client'),
    'booking:' || v_booking.id::text || ':status:' || new.to_status::text || ':client',
    'booking_updates'
  );

  if v_booking.pro_id is not null and v_pro_title is not null then
    perform public.create_klipp_notification(
      v_booking.pro_id, v_booking.id, 'booking_status', v_pro_title, v_pro_body,
      jsonb_build_object('bookingId', v_booking.id, 'status', new.to_status, 'target', 'pro'),
      'booking:' || v_booking.id::text || ':status:' || new.to_status::text || ':pro',
      'booking_updates'
    );
  end if;

  return new;
end;
$$;
revoke all on function public.notify_klipp_booking_status() from public, anon, authenticated;

drop trigger if exists booking_status_create_notifications on public.booking_status_events;
create trigger booking_status_create_notifications
  after insert on public.booking_status_events
  for each row execute function public.notify_klipp_booking_status();

create or replace function public.notify_klipp_booking_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found then return new; end if;

  if new.status = 'pending' then
    perform public.create_klipp_notification(
      new.pro_id, new.booking_id, 'booking_request', 'Nueva solicitud de servicio',
      'Tienes una solicitud nueva. Revisa los detalles y responde antes de que expire.',
      jsonb_build_object('bookingId', new.booking_id, 'requestId', new.id, 'target', 'pro'),
      'booking-request:' || new.id::text || ':pending',
      'booking_updates'
    );
  elsif new.status in ('rejected', 'expired') and v_booking.assignment_mode = 'manual' then
    perform public.create_klipp_notification(
      v_booking.client_id, new.booking_id, 'booking_request_update',
      case when new.status = 'rejected' then 'El profesional no puede aceptar el servicio' else 'La solicitud ha expirado' end,
      case when new.status = 'rejected'
        then 'El profesional seleccionado no está disponible. Puedes elegir otro profesional o buscar una alternativa.'
        else 'El profesional no respondió a tiempo. Puedes volver a intentarlo con otro profesional.'
      end,
      jsonb_build_object('bookingId', new.booking_id, 'requestId', new.id, 'target', 'client', 'requestStatus', new.status),
      'booking-request:' || new.id::text || ':' || new.status::text || ':client',
      'booking_updates'
    );
  end if;
  return new;
end;
$$;
revoke all on function public.notify_klipp_booking_request() from public, anon, authenticated;

drop trigger if exists booking_request_create_notification on public.booking_requests;
create trigger booking_request_create_notification
  after insert or update of status on public.booking_requests
  for each row execute function public.notify_klipp_booking_request();

create or replace function public.notify_klipp_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_recipient uuid;
begin
  select * into v_booking from public.bookings where id = new.booking_id;
  if not found then return new; end if;

  if new.sender_id = v_booking.client_id then
    v_recipient := v_booking.pro_id;
  elsif new.sender_id = v_booking.pro_id then
    v_recipient := v_booking.client_id;
  else
    return new;
  end if;

  if v_recipient is not null then
    perform public.create_klipp_notification(
      v_recipient, new.booking_id, 'chat_message', 'Nuevo mensaje en Klipp',
      'Tienes un mensaje nuevo sobre uno de tus servicios.',
      jsonb_build_object('bookingId', new.booking_id, 'messageId', new.id, 'target', 'chat'),
      'booking-message:' || new.id::text,
      'chat_messages'
    );
  end if;
  return new;
end;
$$;
revoke all on function public.notify_klipp_chat_message() from public, anon, authenticated;

drop trigger if exists booking_message_create_notification on public.messages;
create trigger booking_message_create_notification
  after insert on public.messages
  for each row execute function public.notify_klipp_chat_message();

-- Atomically claim a small batch so concurrent workers do not send the same row.
create or replace function public.claim_klipp_push_deliveries(p_limit integer default 50)
returns table(queue_id uuid, notification_id uuid, attempts integer)
language sql
security definer
set search_path = public
as $$
  with picked as (
    select q.id
    from public.push_delivery_queue q
    where (
        (q.status = 'pending' and q.next_attempt_at <= now())
        or (q.status = 'processing' and q.claimed_at < now() - interval '10 minutes')
      )
      and q.attempts < 5
    order by q.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    for update skip locked
  )
  update public.push_delivery_queue q
  set status = 'processing',
      attempts = q.attempts + 1,
      claimed_at = now(),
      last_error = null
  from picked
  where q.id = picked.id
  returning q.id, q.notification_id, q.attempts;
$$;
revoke all on function public.claim_klipp_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_klipp_push_deliveries(integer) to service_role;

-- Realtime powers the in-app inbox; push is dispatched by the scheduled Edge Function.
alter table public.notifications replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;


-- Track the last ETA baseline so meaningful delays can be notified without spamming.
create table if not exists public.booking_eta_tracking (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  last_notified_eta_minutes integer not null check (last_notified_eta_minutes > 0),
  updated_at timestamptz not null default now()
);
alter table public.booking_eta_tracking enable row level security;
grant select, insert, update on public.booking_eta_tracking to service_role;

create or replace function public.should_notify_booking_eta_delay(
  p_booking_id uuid,
  p_eta_minutes integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baseline integer;
begin
  if p_eta_minutes is null or p_eta_minutes < 1 then return false; end if;
  perform 1 from public.bookings
    where id = p_booking_id and status = 'en_route'
    for update;
  if not found then return false; end if;

  select last_notified_eta_minutes into v_baseline
    from public.booking_eta_tracking
    where booking_id = p_booking_id
    for update;

  if not found then
    insert into public.booking_eta_tracking (booking_id, last_notified_eta_minutes)
    values (p_booking_id, p_eta_minutes)
    on conflict (booking_id) do nothing;
    return false;
  end if;

  if p_eta_minutes >= v_baseline + 10 then
    update public.booking_eta_tracking
      set last_notified_eta_minutes = p_eta_minutes, updated_at = now()
      where booking_id = p_booking_id;
    return true;
  end if;

  if p_eta_minutes <= v_baseline - 10 then
    update public.booking_eta_tracking
      set last_notified_eta_minutes = p_eta_minutes, updated_at = now()
      where booking_id = p_booking_id;
  else
    update public.booking_eta_tracking
      set updated_at = now()
      where booking_id = p_booking_id;
  end if;
  return false;
end;
$$;
revoke all on function public.should_notify_booking_eta_delay(uuid, integer) from public, anon, authenticated;
grant execute on function public.should_notify_booking_eta_delay(uuid, integer) to service_role;
