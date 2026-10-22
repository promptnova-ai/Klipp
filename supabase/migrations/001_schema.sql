-- =====================================================================
-- App de servicios autónomos a domicilio (limpieza) — Santo Domingo, RD
-- Migración 001: esquema inicial para Supabase (Postgres + PostGIS)
-- Ejecutar en el SQL Editor de Supabase en un proyecto nuevo.
-- Moneda: DOP. Zona horaria de negocio: America/Santo_Domingo.
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type user_role           as enum ('client', 'pro', 'admin');
create type zone_name           as enum ('distrito_nacional', 'santo_domingo_este', 'santo_domingo_norte', 'santo_domingo_oeste');
create type verification_status as enum ('pending', 'approved', 'rejected');
create type assignment_mode     as enum ('manual', 'auto');
create type booking_status      as enum (
  'requested',         -- creada; esperando que un profesional acepte
  'awaiting_payment',  -- un profesional aceptó; el cliente debe pagar
  'scheduled',         -- pagada (fondos retenidos)
  'en_route',
  'arrived',
  'in_progress',
  'completed',         -- el profesional marcó terminado
  'confirmed',         -- el cliente confirmó; se liberan los fondos
  'cancelled',
  'disputed',
  'expired'
);
create type request_status      as enum ('pending', 'accepted', 'rejected', 'expired');
create type payment_status      as enum ('pending', 'held', 'released', 'refunded', 'failed');
create type issue_status        as enum ('open', 'in_review', 'resolved');

-- ---------------------------------------------------------------------
-- Usuarios y perfiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'client',
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create table public.sectors (
  id      int generated always as identity primary key,
  name    text not null,
  zone    zone_name not null,
  center  extensions.geography(Point, 4326) not null,
  active  boolean not null default true,
  unique (name, zone)
);
create index sectors_center_gix on public.sectors using gist (center);

create table public.pro_profiles (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  bio                 text,
  years_experience    int check (years_experience >= 0),
  base_sector_id      int references public.sectors(id),
  verification_status verification_status not null default 'pending',
  id_document_path    text,                       -- ruta privada en Storage (cédula)
  accepts_auto_assign boolean not null default true,
  active              boolean not null default true,
  rating_avg          numeric(3,2) not null default 0,
  rating_count        int not null default 0,
  jobs_completed      int not null default 0,
  created_at          timestamptz not null default now()
);

create table public.pro_sectors (
  pro_id     uuid not null references public.pro_profiles(user_id) on delete cascade,
  sector_id  int  not null references public.sectors(id) on delete cascade,
  primary key (pro_id, sector_id)
);
create index pro_sectors_sector_idx on public.pro_sectors (sector_id);

create table public.pro_availability (
  id          bigint generated always as identity primary key,
  pro_id      uuid not null references public.pro_profiles(user_id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),  -- 1 = lunes ... 7 = domingo (ISO)
  start_time  time not null,
  end_time    time not null,
  check (end_time > start_time)
);
create index pro_availability_pro_idx on public.pro_availability (pro_id, weekday);

-- Cuenta para pagar al profesional.
-- IMPORTANTE: antes de producción, cifrar account_number (Supabase Vault / pgsodium)
-- y restringir su lectura solo al backend.
create table public.pro_payout_accounts (
  pro_id          uuid primary key references public.pro_profiles(user_id) on delete cascade,
  bank_name       text not null,
  account_holder  text not null,
  account_number  text not null,
  account_type    text
);

-- ---------------------------------------------------------------------
-- Catálogo de servicios y precios (precio cerrado por tamaño)
-- ---------------------------------------------------------------------
create table public.service_types (
  id           int generated always as identity primary key,
  code         text not null unique,
  name         text not null,
  description  text,
  active       boolean not null default true
);

create table public.pricing_tiers (
  id               int generated always as identity primary key,
  service_type_id  int not null references public.service_types(id),
  label            text not null,
  bedrooms         int,
  bathrooms        int,
  price_dop        numeric(10,2) not null check (price_dop > 0),
  est_minutes      int not null check (est_minutes > 0)
);

-- ---------------------------------------------------------------------
-- Direcciones de clientes (pin en el mapa + sector + referencias)
-- ---------------------------------------------------------------------
create table public.addresses (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.profiles(id) on delete cascade,
  label            text,
  street           text,
  references_text  text,
  sector_id        int not null references public.sectors(id),
  location         extensions.geography(Point, 4326) not null,
  created_at       timestamptz not null default now()
);
create index addresses_client_idx on public.addresses (client_id);
create index addresses_location_gix on public.addresses using gist (location);

-- ---------------------------------------------------------------------
-- Reservas
-- ---------------------------------------------------------------------
create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.profiles(id),
  pro_id           uuid references public.pro_profiles(user_id),
  service_type_id  int  not null references public.service_types(id),
  pricing_tier_id  int  not null references public.pricing_tiers(id),
  address_id       uuid not null references public.addresses(id),
  assignment_mode  assignment_mode not null,
  status           booking_status not null default 'requested',
  scheduled_start  timestamptz not null,
  est_minutes      int not null,
  price_dop        numeric(10,2) not null,
  commission_pct   numeric(5,2)  not null,
  commission_dop   numeric(10,2) not null,
  pro_payout_dop   numeric(10,2) not null,
  notes            text,
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  en_route_at      timestamptz,
  arrived_at       timestamptz,
  started_at       timestamptz,
  completed_at     timestamptz,
  confirmed_at     timestamptz,
  cancelled_at     timestamptz,
  cancelled_by     uuid references public.profiles(id),
  cancel_reason    text
);
create index bookings_client_idx on public.bookings (client_id, created_at desc);
create index bookings_pro_idx    on public.bookings (pro_id, scheduled_start);

-- Solicitudes enviadas a profesionales (manual: una; automática: una a una)
create table public.booking_requests (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id) on delete cascade,
  pro_id        uuid not null references public.pro_profiles(user_id),
  status        request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  responded_at  timestamptz,
  unique (booking_id, pro_id)
);
create index booking_requests_pro_idx on public.booking_requests (pro_id, status);

-- ---------------------------------------------------------------------
-- Pagos
-- ---------------------------------------------------------------------
create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null references public.bookings(id),
  provider      text not null default 'azul',
  provider_ref  text,
  amount_dop    numeric(10,2) not null,
  status        payment_status not null default 'pending',
  created_at    timestamptz not null default now(),
  held_at       timestamptz,
  released_at   timestamptz
);
create index payments_booking_idx on public.payments (booking_id);

create table public.payouts (
  id          uuid primary key default gen_random_uuid(),
  pro_id      uuid not null references public.pro_profiles(user_id),
  booking_id  uuid not null unique references public.bookings(id),
  amount_dop  numeric(10,2) not null,
  status      text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  reference   text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

-- ---------------------------------------------------------------------
-- Social: reseñas, favoritos, chat, reclamaciones
-- ---------------------------------------------------------------------
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references public.bookings(id),
  client_id   uuid not null references public.profiles(id),
  pro_id      uuid not null references public.pro_profiles(user_id),
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);
create index reviews_pro_idx on public.reviews (pro_id);

create table public.favorites (
  client_id   uuid not null references public.profiles(id) on delete cascade,
  pro_id      uuid not null references public.pro_profiles(user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (client_id, pro_id)
);

create table public.messages (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id),
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index messages_booking_idx on public.messages (booking_id, created_at);

create table public.issues (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id),
  reporter_id  uuid not null references public.profiles(id),
  category     text not null,
  description  text,
  status       issue_status not null default 'open',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- Ubicación en vivo del profesional (una fila por reserva, se actualiza con upsert)
create table public.pro_locations (
  booking_id  uuid primary key references public.bookings(id) on delete cascade,
  pro_id      uuid not null references public.pro_profiles(user_id),
  location    extensions.geography(Point, 4326) not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Crear perfil al registrarse. El rol 'admin' nunca se puede elegir desde el registro.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role user_role := case
    when new.raw_user_meta_data->>'role' = 'pro' then 'pro'::user_role
    else 'client'::user_role
  end;
begin
  insert into public.profiles (id, role, full_name, phone)
  values (new.id, v_role, new.raw_user_meta_data->>'full_name', new.phone);

  if v_role = 'pro' then
    insert into public.pro_profiles (user_id) values (new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Recalcular calificación del profesional
create or replace function public.refresh_pro_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.pro_profiles p set
    rating_avg   = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where pro_id = new.pro_id), 0),
    rating_count = (select count(*) from public.reviews where pro_id = new.pro_id)
  where p.user_id = new.pro_id;
  return new;
end $$;

create trigger trg_reviews_rating
  after insert or update on public.reviews
  for each row execute function public.refresh_pro_rating();

-- Contar servicios completados
create or replace function public.bump_jobs_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' and new.pro_id is not null then
    update public.pro_profiles set jobs_completed = jobs_completed + 1 where user_id = new.pro_id;
  end if;
  return new;
end $$;

create trigger trg_bookings_jobs
  after update of status on public.bookings
  for each row execute function public.bump_jobs_completed();

-- ---------------------------------------------------------------------
-- Vista pública de profesionales (sin datos sensibles)
-- ---------------------------------------------------------------------
create view public.pro_cards as
select
  p.user_id as pro_id,
  pr.full_name,
  pr.avatar_url,
  p.bio,
  p.years_experience,
  p.base_sector_id,
  p.rating_avg,
  p.rating_count,
  p.jobs_completed
from public.pro_profiles p
join public.profiles pr on pr.id = p.user_id
where p.verification_status = 'approved' and p.active;

grant select on public.pro_cards to authenticated;

-- ---------------------------------------------------------------------
-- Funciones de negocio (los precios y estados los decide el servidor)
-- ---------------------------------------------------------------------

-- Crear una reserva. En modo manual envía la solicitud al profesional elegido.
-- En modo automático la reserva queda en 'requested' y una Edge Function usa
-- find_auto_candidates() para ir ofreciéndola.
create or replace function public.create_booking(
  p_pricing_tier_id  int,
  p_address_id       uuid,
  p_scheduled_start  timestamptz,
  p_mode             assignment_mode,
  p_pro_id           uuid default null,
  p_notes            text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tier           public.pricing_tiers%rowtype;
  v_booking        uuid;
  v_commission_pct numeric(5,2) := 20.00;   -- ajustable
  v_commission     numeric(10,2);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if not exists (select 1 from public.addresses where id = p_address_id and client_id = auth.uid()) then
    raise exception 'invalid address';
  end if;

  if p_scheduled_start <= now() then
    raise exception 'start must be in the future';
  end if;

  select * into v_tier from public.pricing_tiers where id = p_pricing_tier_id;
  if not found then raise exception 'invalid pricing tier'; end if;

  if p_mode = 'manual' then
    if p_pro_id is null then raise exception 'pro required for manual mode'; end if;

    if not exists (
      select 1
      from public.pro_profiles p
      join public.pro_sectors ps on ps.pro_id = p.user_id
      join public.addresses a    on a.sector_id = ps.sector_id
      where p.user_id = p_pro_id
        and p.verification_status = 'approved'
        and p.active
        and a.id = p_address_id
    ) then
      raise exception 'pro not available in that sector';
    end if;
  end if;

  v_commission := round(v_tier.price_dop * v_commission_pct / 100, 2);

  insert into public.bookings (
    client_id, service_type_id, pricing_tier_id, address_id, assignment_mode,
    scheduled_start, est_minutes, price_dop, commission_pct, commission_dop,
    pro_payout_dop, notes
  ) values (
    auth.uid(), v_tier.service_type_id, v_tier.id, p_address_id, p_mode,
    p_scheduled_start, v_tier.est_minutes, v_tier.price_dop, v_commission_pct, v_commission,
    v_tier.price_dop - v_commission, p_notes
  ) returning id into v_booking;

  if p_mode = 'manual' then
    insert into public.booking_requests (booking_id, pro_id, expires_at)
    values (v_booking, p_pro_id, now() + interval '2 hours');
  end if;

  return v_booking;
end $$;

-- El profesional acepta o rechaza una solicitud.
create or replace function public.respond_to_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.booking_requests%rowtype;
begin
  select * into v_req
  from public.booking_requests
  where id = p_request_id and pro_id = auth.uid() and status = 'pending' and expires_at > now()
  for update;

  if not found then raise exception 'request not found or expired'; end if;

  if p_accept then
    update public.bookings
       set pro_id = auth.uid(), status = 'awaiting_payment', accepted_at = now()
     where id = v_req.booking_id and status = 'requested' and pro_id is null;

    if not found then raise exception 'booking no longer available'; end if;

    update public.booking_requests
       set status = 'accepted', responded_at = now()
     where id = v_req.id;

    update public.booking_requests
       set status = 'expired', responded_at = now()
     where booking_id = v_req.booking_id and id <> v_req.id and status = 'pending';
  else
    update public.booking_requests
       set status = 'rejected', responded_at = now()
     where id = v_req.id;
  end if;
end $$;

-- Avanzar el estado de una reserva con las transiciones permitidas por rol.
-- 'scheduled' (pago retenido) y la liberación del pago los gestiona el backend
-- (webhook de la pasarela / Edge Function con service_role).
create or replace function public.advance_booking(p_booking_id uuid, p_new_status booking_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v public.bookings%rowtype;
begin
  select * into v from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found'; end if;

  if auth.uid() = v.pro_id then
    if not (
      (v.status = 'scheduled'   and p_new_status = 'en_route')    or
      (v.status = 'en_route'    and p_new_status = 'arrived')     or
      (v.status = 'arrived'     and p_new_status = 'in_progress') or
      (v.status = 'in_progress' and p_new_status = 'completed')
    ) then raise exception 'invalid transition'; end if;

  elsif auth.uid() = v.client_id then
    if not (v.status = 'completed' and p_new_status = 'confirmed') then
      raise exception 'invalid transition';
    end if;
  else
    raise exception 'not allowed';
  end if;

  update public.bookings set
    status       = p_new_status,
    en_route_at  = case when p_new_status = 'en_route'    then now() else en_route_at  end,
    arrived_at   = case when p_new_status = 'arrived'     then now() else arrived_at   end,
    started_at   = case when p_new_status = 'in_progress' then now() else started_at   end,
    completed_at = case when p_new_status = 'completed'   then now() else completed_at end,
    confirmed_at = case when p_new_status = 'confirmed'   then now() else confirmed_at end
  where id = p_booking_id;
end $$;

-- Candidatos para la asignación automática (solo backend).
-- Filtra: sector del cliente en los sectores del profesional, verificado, activo,
-- acepta asignación automática, con disponibilidad ese día/hora y sin solapar otro
-- servicio (con 60 min de margen por tráfico). Ordena por cercanía y calificación.
-- Pendiente: rotación para dar visibilidad a profesionales nuevos.
create or replace function public.find_auto_candidates(p_booking_id uuid, p_limit int default 5)
returns table (pro_id uuid, distance_m double precision, rating_avg numeric)
language sql stable security definer set search_path = public, extensions as $$
  with b as (
    select bk.id, bk.scheduled_start, bk.est_minutes, a.sector_id, a.location
    from public.bookings bk
    join public.addresses a on a.id = bk.address_id
    where bk.id = p_booking_id
  )
  select p.user_id,
         st_distance(b.location, s.center) as distance_m,
         p.rating_avg
  from b
  join public.pro_sectors ps on ps.sector_id = b.sector_id
  join public.pro_profiles p on p.user_id = ps.pro_id
  join public.sectors s      on s.id = p.base_sector_id
  where p.verification_status = 'approved'
    and p.active
    and p.accepts_auto_assign
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id = p.user_id
        and av.weekday = extract(isodow from (b.scheduled_start at time zone 'America/Santo_Domingo'))::int
        and av.start_time <= (b.scheduled_start at time zone 'America/Santo_Domingo')::time
        and av.end_time   >= ((b.scheduled_start + make_interval(mins => b.est_minutes)) at time zone 'America/Santo_Domingo')::time
    )
    and not exists (
      select 1 from public.bookings o
      where o.pro_id = p.user_id
        and o.status in ('scheduled', 'en_route', 'arrived', 'in_progress')
        and tstzrange(
              o.scheduled_start - interval '60 minutes',
              o.scheduled_start + make_interval(mins => o.est_minutes) + interval '60 minutes'
            ) && tstzrange(b.scheduled_start, b.scheduled_start + make_interval(mins => b.est_minutes))
    )
    and not exists (
      select 1 from public.booking_requests r
      where r.booking_id = b.id and r.pro_id = p.user_id
    )
  order by distance_m asc, p.rating_avg desc
  limit p_limit;
$$;

-- Permisos de ejecución
revoke execute on function public.create_booking(int, uuid, timestamptz, assignment_mode, uuid, text) from public, anon;
revoke execute on function public.respond_to_request(uuid, boolean)                                  from public, anon;
revoke execute on function public.advance_booking(uuid, booking_status)                              from public, anon;
revoke execute on function public.find_auto_candidates(uuid, int)                                    from public, anon, authenticated;

grant execute on function public.create_booking(int, uuid, timestamptz, assignment_mode, uuid, text) to authenticated;
grant execute on function public.respond_to_request(uuid, boolean)                                  to authenticated;
grant execute on function public.advance_booking(uuid, booking_status)                              to authenticated;
grant execute on function public.find_auto_candidates(uuid, int)                                    to service_role;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.sectors             enable row level security;
alter table public.pro_profiles        enable row level security;
alter table public.pro_sectors         enable row level security;
alter table public.pro_availability    enable row level security;
alter table public.pro_payout_accounts enable row level security;
alter table public.service_types       enable row level security;
alter table public.pricing_tiers       enable row level security;
alter table public.addresses           enable row level security;
alter table public.bookings            enable row level security;
alter table public.booking_requests    enable row level security;
alter table public.payments            enable row level security;
alter table public.payouts             enable row level security;
alter table public.reviews             enable row level security;
alter table public.favorites           enable row level security;
alter table public.messages            enable row level security;
alter table public.issues              enable row level security;
alter table public.pro_locations       enable row level security;

-- Columnas que el usuario NO puede modificar directamente (rol, verificación, rating...)
revoke update on public.profiles     from authenticated;
grant  update (full_name, phone, avatar_url) on public.profiles to authenticated;

revoke update on public.pro_profiles from authenticated;
grant  update (bio, years_experience, base_sector_id, accepts_auto_assign, active, id_document_path)
  on public.pro_profiles to authenticated;

-- Catálogos de lectura
create policy sectors_read       on public.sectors       for select to authenticated using (true);
create policy service_types_read on public.service_types for select to authenticated using (true);
create policy pricing_tiers_read on public.pricing_tiers for select to authenticated using (true);

-- Perfiles
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Datos del profesional
create policy pro_profiles_select_own on public.pro_profiles for select to authenticated using (user_id = auth.uid());
create policy pro_profiles_update_own on public.pro_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy pro_sectors_read   on public.pro_sectors      for select to authenticated using (true);
create policy pro_sectors_manage on public.pro_sectors      for all    to authenticated
  using (pro_id = auth.uid()) with check (pro_id = auth.uid());

create policy pro_availability_read   on public.pro_availability for select to authenticated using (true);
create policy pro_availability_manage on public.pro_availability for all    to authenticated
  using (pro_id = auth.uid()) with check (pro_id = auth.uid());

create policy payout_accounts_own on public.pro_payout_accounts for all to authenticated
  using (pro_id = auth.uid()) with check (pro_id = auth.uid());

-- Direcciones
create policy addresses_own on public.addresses for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());

-- Reservas: solo lectura directa; las escrituras pasan por las funciones RPC
create policy bookings_select_participants on public.bookings for select to authenticated
  using (client_id = auth.uid() or pro_id = auth.uid());

create policy booking_requests_select_pro on public.booking_requests for select to authenticated
  using (pro_id = auth.uid());

-- Pagos: el cliente ve los suyos, el profesional ve sus liquidaciones
create policy payments_select_client on public.payments for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.client_id = auth.uid()));

create policy payouts_select_pro on public.payouts for select to authenticated
  using (pro_id = auth.uid());

-- Reseñas: lectura abierta; solo el cliente de una reserva completada puede crearla
create policy reviews_read on public.reviews for select to authenticated using (true);
create policy reviews_insert_client on public.reviews for insert to authenticated
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.client_id = auth.uid()
        and b.pro_id = reviews.pro_id
        and b.status in ('completed', 'confirmed')
    )
  );

-- Favoritos
create policy favorites_own on public.favorites for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());

-- Chat: solo los participantes de la reserva
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_id and (b.client_id = auth.uid() or b.pro_id = auth.uid())));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid()
              and exists (select 1 from public.bookings b
                          where b.id = booking_id and (b.client_id = auth.uid() or b.pro_id = auth.uid())));

-- Reclamaciones
create policy issues_select on public.issues for select to authenticated
  using (reporter_id = auth.uid()
         or exists (select 1 from public.bookings b
                    where b.id = booking_id and (b.client_id = auth.uid() or b.pro_id = auth.uid())));
create policy issues_insert on public.issues for insert to authenticated
  with check (reporter_id = auth.uid()
              and exists (select 1 from public.bookings b
                          where b.id = booking_id and (b.client_id = auth.uid() or b.pro_id = auth.uid())));

-- Ubicación en vivo: el profesional solo la escribe durante 'en_route';
-- el cliente solo la ve mientras la reserva está activa.
create policy pro_locations_write on public.pro_locations for insert to authenticated
  with check (pro_id = auth.uid()
              and exists (select 1 from public.bookings b
                          where b.id = booking_id and b.pro_id = auth.uid() and b.status = 'en_route'));
create policy pro_locations_update on public.pro_locations for update to authenticated
  using (pro_id = auth.uid())
  with check (pro_id = auth.uid()
              and exists (select 1 from public.bookings b
                          where b.id = booking_id and b.pro_id = auth.uid() and b.status = 'en_route'));
create policy pro_locations_select on public.pro_locations for select to authenticated
  using (pro_id = auth.uid()
         or exists (select 1 from public.bookings b
                    where b.id = booking_id and b.client_id = auth.uid()
                      and b.status in ('scheduled', 'en_route', 'arrived')));

-- Para el seguimiento en vivo, activar Realtime en la tabla desde el dashboard
-- (Database > Replication) o con:
-- alter publication supabase_realtime add table public.pro_locations, public.bookings, public.messages;

-- ---------------------------------------------------------------------
-- Datos iniciales de ejemplo
-- ATENCIÓN: coordenadas aproximadas y precios de ejemplo. Verificar y ajustar
-- antes de usarlos (ST_MakePoint recibe longitud, latitud).
-- ---------------------------------------------------------------------
insert into public.sectors (name, zone, center) values
  ('Naco',             'distrito_nacional',  extensions.st_setsrid(extensions.st_makepoint(-69.9336, 18.4866), 4326)::extensions.geography),
  ('Piantini',         'distrito_nacional',  extensions.st_setsrid(extensions.st_makepoint(-69.9400, 18.4725), 4326)::extensions.geography),
  ('Bella Vista',      'distrito_nacional',  extensions.st_setsrid(extensions.st_makepoint(-69.9410, 18.4585), 4326)::extensions.geography),
  ('Evaristo Morales', 'distrito_nacional',  extensions.st_setsrid(extensions.st_makepoint(-69.9380, 18.4620), 4326)::extensions.geography),
  ('Gazcue',           'distrito_nacional',  extensions.st_setsrid(extensions.st_makepoint(-69.9020, 18.4690), 4326)::extensions.geography),
  ('Zona Colonial',    'distrito_nacional',  extensions.st_setsrid(extensions.st_makepoint(-69.8835, 18.4735), 4326)::extensions.geography),
  ('Los Mina',         'santo_domingo_este', extensions.st_setsrid(extensions.st_makepoint(-69.8360, 18.4930), 4326)::extensions.geography),
  ('Ensanche Ozama',   'santo_domingo_este', extensions.st_setsrid(extensions.st_makepoint(-69.8450, 18.5060), 4326)::extensions.geography),
  ('Villa Mella',      'santo_domingo_norte',extensions.st_setsrid(extensions.st_makepoint(-69.9140, 18.5775), 4326)::extensions.geography);

insert into public.service_types (code, name, description) values
  ('limpieza_regular',  'Limpieza regular',  'Limpieza general de mantenimiento'),
  ('limpieza_profunda', 'Limpieza profunda', 'Limpieza a fondo de toda la vivienda');

insert into public.pricing_tiers (service_type_id, label, bedrooms, bathrooms, price_dop, est_minutes) values
  (1, '1 habitación / 1 baño', 1, 1, 1500, 120),
  (1, '2 habitaciones / 1 baño', 2, 1, 2000, 150),
  (1, '3 habitaciones / 2 baños', 3, 2, 2800, 210),
  (2, '1 habitación / 1 baño', 1, 1, 2500, 180),
  (2, '2 habitaciones / 1 baño', 2, 1, 3200, 240),
  (2, '3 habitaciones / 2 baños', 3, 2, 4200, 300);
