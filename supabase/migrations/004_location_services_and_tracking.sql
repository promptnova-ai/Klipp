create table public.service_categories (
  id integer generated always as identity primary key,
  code text not null unique,
  name text not null,
  description text not null default '',
  active boolean not null default true
);

insert into public.service_categories (code, name, description) values
  ('barberia-estetica', 'Barbería, peluquería y estética', 'Cuidado personal y belleza a domicilio.'),
  ('masajes-bienestar', 'Masajes y bienestar', 'Bienestar y masajes en casa.'),
  ('carwash-detailing', 'Carwash y detailing', 'Limpieza y cuidado automotriz a domicilio.'),
  ('limpieza', 'Limpieza de casas y oficinas', 'Espacios limpios, cuidados por profesionales.'),
  ('mantenimiento-reparaciones', 'Mantenimiento y reparaciones', 'Soluciones técnicas y reparaciones rápidas.')
on conflict (code) do update
set name = excluded.name, description = excluded.description, active = true;

alter table public.service_types
  add column category_id integer references public.service_categories(id);

update public.service_types
set category_id = (select id from public.service_categories where code = 'limpieza')
where category_id is null;

insert into public.service_types (code, name, description, category_id) values
  ('barberia', 'Barbería a domicilio', 'Cortes y arreglo personal en casa.', (select id from public.service_categories where code = 'barberia-estetica')),
  ('peluqueria', 'Peluquería a domicilio', 'Servicios de peluquería en casa.', (select id from public.service_categories where code = 'barberia-estetica')),
  ('estetica', 'Estética a domicilio', 'Cuidado y tratamientos de belleza.', (select id from public.service_categories where code = 'barberia-estetica')),
  ('masajes', 'Masajes y bienestar', 'Masajes profesionales en tu hogar.', (select id from public.service_categories where code = 'masajes-bienestar')),
  ('carwash', 'Carwash a domicilio', 'Lavado de vehículos donde estés.', (select id from public.service_categories where code = 'carwash-detailing')),
  ('detailing', 'Detailing a domicilio', 'Cuidado detallado de tu vehículo.', (select id from public.service_categories where code = 'carwash-detailing')),
  ('limpieza-oficinas', 'Limpieza de oficinas', 'Limpieza profesional de espacios de trabajo.', (select id from public.service_categories where code = 'limpieza')),
  ('mantenimiento', 'Mantenimiento técnico', 'Mantenimiento y reparaciones rápidas a domicilio.', (select id from public.service_categories where code = 'mantenimiento-reparaciones'))
on conflict (code) do update
set name = excluded.name, description = excluded.description, category_id = excluded.category_id;

create table public.pro_services (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references public.pro_profiles(user_id) on delete cascade,
  service_type_id integer not null references public.service_types(id),
  base_price_dop numeric(10,2) not null check (base_price_dop > 0),
  est_minutes integer not null default 60 check (est_minutes > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pro_id, service_type_id)
);
create index pro_services_service_idx on public.pro_services (service_type_id, active);

alter table public.bookings
  alter column pricing_tier_id drop not null,
  add column pro_service_id uuid references public.pro_services(id),
  add column client_lat double precision,
  add column client_lng double precision,
  add column address_text text,
  add column landmark_notes text,
  add constraint bookings_location_pair_check
    check ((client_lat is null) = (client_lng is null)),
  add constraint bookings_latitude_check
    check (client_lat is null or client_lat between -90 and 90),
  add constraint bookings_longitude_check
    check (client_lng is null or client_lng between -180 and 180),
  add constraint bookings_service_source_check
    check ((pricing_tier_id is not null) or (pro_service_id is not null));

alter table public.pro_profiles
  add column transport_type text;
grant update (transport_type) on public.pro_profiles to authenticated;

create or replace view public.pro_cards as
select
  p.user_id as pro_id,
  pr.full_name,
  pr.avatar_url,
  p.bio,
  p.years_experience,
  p.base_sector_id,
  p.rating_avg,
  p.rating_count,
  p.jobs_completed,
  p.transport_type
from public.pro_profiles p
join public.profiles pr on pr.id = p.user_id
where p.verification_status = 'approved' and p.active;

alter table public.pro_locations
  add column latitude double precision,
  add column longitude double precision,
  add constraint pro_locations_coordinate_pair_check
    check ((latitude is null) = (longitude is null)),
  add constraint pro_locations_latitude_check
    check (latitude is null or latitude between -90 and 90),
  add constraint pro_locations_longitude_check
    check (longitude is null or longitude between -180 and 180);

alter table public.service_categories enable row level security;
alter table public.pro_services enable row level security;

create policy service_categories_read
  on public.service_categories for select to authenticated using (active);
create policy pro_services_read_active
  on public.pro_services for select to authenticated using (active);
create policy pro_services_manage_own
  on public.pro_services for all to authenticated
  using (pro_id = auth.uid())
  with check (pro_id = auth.uid());

drop policy if exists pro_locations_select on public.pro_locations;
create policy pro_locations_select on public.pro_locations for select to authenticated
  using (
    pro_id = auth.uid()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.client_id = auth.uid() and b.status = 'en_route'
    )
  );

create or replace function public.clear_pro_location_after_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'en_route' and new.status is distinct from 'en_route' then
    delete from public.pro_locations where booking_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_clear_pro_location_after_trip
  after update of status on public.bookings
  for each row execute function public.clear_pro_location_after_trip();

create or replace function public.publish_pro_location(
  p_booking_id uuid,
  p_latitude double precision,
  p_longitude double precision
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  perform 1 from public.bookings
  where id = p_booking_id and pro_id = auth.uid() and status = 'en_route'
  for update;
  if not found then
    return false;
  end if;

  insert into public.pro_locations (booking_id, pro_id, location, latitude, longitude, updated_at)
  values (
    p_booking_id, auth.uid(),
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    p_latitude, p_longitude, now()
  )
  on conflict (booking_id) do update
  set location = excluded.location,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = excluded.updated_at
  where public.pro_locations.pro_id = auth.uid();
  return true;
end;
$$;

revoke all on function public.publish_pro_location(uuid, double precision, double precision) from public, anon;
grant execute on function public.publish_pro_location(uuid, double precision, double precision) to authenticated;

create or replace function public.get_tracking_pro_phone(p_booking_id uuid)
returns table(phone text)
language sql
stable
security definer
set search_path = public
as $$
  select p.phone
  from public.bookings b
  join public.profiles p on p.id = b.pro_id
  where b.id = p_booking_id
    and b.client_id = auth.uid()
    and b.status = 'en_route'
$$;

revoke all on function public.get_tracking_pro_phone(uuid) from public, anon;
grant execute on function public.get_tracking_pro_phone(uuid) to authenticated;

create or replace function public.closest_active_sector(p_lat double precision, p_lng double precision)
returns integer
language sql
stable
security definer
set search_path = public, extensions
as $$
  select s.id
  from public.sectors s
  where s.active
  order by extensions.st_distance(
    s.center,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  )
  limit 1
$$;

revoke all on function public.closest_active_sector(double precision, double precision) from public, anon, authenticated;

create or replace function public.get_available_service_slots(
  p_pro_service_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_date date
) returns table(slot_time time)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_offer public.pro_services%rowtype;
  v_sector_id integer;
  v_pro_active boolean;
  v_pro_verified boolean;
  v_weekday smallint;
  v_local timestamp without time zone;
  v_start timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;

  select * into v_offer from public.pro_services
  where id = p_pro_service_id and active;
  if not found then raise exception 'service offer is unavailable'; end if;
  select pp.active, pp.verification_status = 'approved'
  into v_pro_active, v_pro_verified
  from public.pro_profiles pp where pp.user_id = v_offer.pro_id;
  if not found or not v_pro_active or not v_pro_verified then
    raise exception 'service offer is unavailable';
  end if;

  v_sector_id := public.closest_active_sector(p_lat, p_lng);
  if v_sector_id is null or not exists (
    select 1 from public.pro_sectors where pro_id = v_offer.pro_id and sector_id = v_sector_id
  ) then
    return;
  end if;
  v_weekday := extract(isodow from p_date)::smallint;

  for v_local in
    select p_date::timestamp + make_interval(mins => minute_of_day)
    from generate_series(480, 1080, 30) as slots(minute_of_day)
  loop
    v_start := v_local at time zone 'America/Santo_Domingo';
    if v_start > now()
      and v_local::date = (v_local + make_interval(mins => v_offer.est_minutes))::date
      and exists (
        select 1 from public.pro_availability av
        where av.pro_id = v_offer.pro_id
          and av.weekday = v_weekday
          and av.start_time <= v_local::time
          and av.end_time >= (v_local + make_interval(mins => v_offer.est_minutes))::time
      )
      and not exists (
        select 1 from public.bookings b
        where b.pro_id = v_offer.pro_id
          and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
          and tstzrange(b.scheduled_start - interval '60 minutes',
                        b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
              && tstzrange(v_start, v_start + make_interval(mins => v_offer.est_minutes), '[)')
      )
      and not exists (
        select 1 from public.booking_requests br
        join public.bookings b on b.id = br.booking_id
        where br.pro_id = v_offer.pro_id and br.status = 'pending'
          and br.expires_at > now() and b.status = 'requested'
          and tstzrange(b.scheduled_start - interval '60 minutes',
                        b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
              && tstzrange(v_start, v_start + make_interval(mins => v_offer.est_minutes), '[)')
      )
    then
      slot_time := v_local::time;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.get_available_pros_at_location(
  p_lat double precision,
  p_lng double precision,
  p_scheduled_start timestamptz,
  p_est_minutes integer
) returns table(
  pro_id uuid,
  full_name text,
  avatar_url text,
  bio text,
  years_experience integer,
  base_sector_id integer,
  rating_avg numeric,
  rating_count integer,
  jobs_completed integer
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with location_sector as (
    select public.closest_active_sector(p_lat, p_lng) as sector_id
  ),
  window as (
    select p_scheduled_start at time zone 'America/Santo_Domingo' as local_start,
           (p_scheduled_start + make_interval(mins => p_est_minutes))
             at time zone 'America/Santo_Domingo' as local_end
  )
  select pc.pro_id, pc.full_name, pc.avatar_url, pc.bio, pc.years_experience,
         pc.base_sector_id, pc.rating_avg, pc.rating_count, pc.jobs_completed
  from location_sector ls
  cross join window w
  join public.pro_sectors ps on ps.sector_id = ls.sector_id
  join public.pro_profiles pp on pp.user_id = ps.pro_id
  join public.pro_cards pc on pc.pro_id = pp.user_id
  where p_lat between -90 and 90 and p_lng between -180 and 180
    and p_scheduled_start > now()
    and w.local_start::date = w.local_end::date
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id = pp.user_id
        and av.weekday = extract(isodow from w.local_start)::smallint
        and av.start_time <= w.local_start::time and av.end_time >= w.local_end::time
    )
    and not exists (
      select 1 from public.bookings b
      where b.pro_id = pp.user_id
        and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
        and tstzrange(b.scheduled_start - interval '60 minutes',
                      b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
            && tstzrange(p_scheduled_start,
                         p_scheduled_start + make_interval(mins => p_est_minutes), '[)')
    )
    and not exists (
      select 1 from public.booking_requests br
      join public.bookings b on b.id = br.booking_id
      where br.pro_id = pp.user_id and br.status = 'pending'
        and br.expires_at > now() and b.status = 'requested'
        and tstzrange(b.scheduled_start - interval '60 minutes',
                      b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
            && tstzrange(p_scheduled_start,
                         p_scheduled_start + make_interval(mins => p_est_minutes), '[)')
    )
  order by pc.rating_avg desc, pc.jobs_completed desc
$$;

create or replace function public.get_available_booking_slots_at_location(
  p_pricing_tier_id integer,
  p_lat double precision,
  p_lng double precision,
  p_date date,
  p_mode assignment_mode default 'manual'
) returns table(slot_time time)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tier public.pricing_tiers%rowtype;
  v_sector_id integer;
  v_local timestamp without time zone;
  v_start timestamptz;
  v_weekday smallint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid location'; end if;
  select * into v_tier from public.pricing_tiers where id = p_pricing_tier_id;
  if not found then raise exception 'invalid pricing tier'; end if;
  v_sector_id := public.closest_active_sector(p_lat, p_lng);
  v_weekday := extract(isodow from p_date)::smallint;

  for v_local in
    select p_date::timestamp + make_interval(mins => minute_of_day)
    from generate_series(480, 1080, 30) as slots(minute_of_day)
  loop
    v_start := v_local at time zone 'America/Santo_Domingo';
    if v_start > now()
      and v_local::date = (v_local + make_interval(mins => v_tier.est_minutes))::date
      and exists (
        select 1
        from public.pro_sectors ps
        join public.pro_profiles pp on pp.user_id = ps.pro_id
        join public.pro_availability av on av.pro_id = pp.user_id
        where ps.sector_id = v_sector_id and pp.active and pp.verification_status = 'approved'
          and (p_mode = 'manual' or pp.accepts_auto_assign)
          and av.weekday = v_weekday
          and av.start_time <= v_local::time
          and av.end_time >= (v_local + make_interval(mins => v_tier.est_minutes))::time
          and not exists (
            select 1 from public.bookings b
            where b.pro_id = pp.user_id
              and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
              and tstzrange(b.scheduled_start - interval '60 minutes',
                            b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
                  && tstzrange(v_start, v_start + make_interval(mins => v_tier.est_minutes), '[)')
          )
          and not exists (
            select 1 from public.booking_requests br
            join public.bookings b on b.id = br.booking_id
            where br.pro_id = pp.user_id and br.status = 'pending'
              and br.expires_at > now() and b.status = 'requested'
              and tstzrange(b.scheduled_start - interval '60 minutes',
                            b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
                  && tstzrange(v_start, v_start + make_interval(mins => v_tier.est_minutes), '[)')
          )
      )
    then
      slot_time := v_local::time;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.create_tier_booking_at_location(
  p_pricing_tier_id integer,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_mode assignment_mode,
  p_pro_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sector_id integer;
  v_address_id uuid;
  v_booking_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid location'; end if;
  v_sector_id := public.closest_active_sector(p_lat, p_lng);
  if v_sector_id is null then raise exception 'no service area is configured for this location'; end if;

  insert into public.addresses (client_id, label, street, references_text, sector_id, location)
  values (
    auth.uid(), 'Ubicación de reserva', nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''), v_sector_id,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  ) returning id into v_address_id;

  v_booking_id := public.create_booking(
    p_pricing_tier_id, v_address_id, p_scheduled_start, p_mode, p_pro_id, p_landmark_notes
  );
  update public.bookings
  set client_lat = p_lat,
      client_lng = p_lng,
      address_text = nullif(trim(p_address_text), ''),
      landmark_notes = nullif(trim(p_landmark_notes), '')
  where id = v_booking_id;
  return v_booking_id;
end;
$$;

create or replace function public.save_address_at_location(
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sector_id integer;
  v_address_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid location'; end if;
  v_sector_id := public.closest_active_sector(p_lat, p_lng);
  if v_sector_id is null then raise exception 'no service area is configured for this location'; end if;
  insert into public.addresses (client_id, label, street, references_text, sector_id, location)
  values (
    auth.uid(), 'Ubicación guardada', nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''), v_sector_id,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  ) returning id into v_address_id;
  return v_address_id;
end;
$$;

create or replace function public.create_booking_at_location(
  p_pro_service_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_offer public.pro_services%rowtype;
  v_sector_id integer;
  v_address_id uuid;
  v_booking_id uuid;
  v_commission_pct numeric(5,2) := 20.00;
  v_local timestamp without time zone;
  v_end_local timestamp without time zone;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  if p_scheduled_start <= now() then raise exception 'start must be in the future'; end if;

  select * into v_offer from public.pro_services
  where id = p_pro_service_id and active;
  if not found then raise exception 'service offer is unavailable'; end if;
  if not exists (
    select 1 from public.pro_profiles
    where user_id = v_offer.pro_id and active and verification_status = 'approved'
  ) then raise exception 'professional is not verified'; end if;

  v_sector_id := public.closest_active_sector(p_lat, p_lng);
  if v_sector_id is null or not exists (
    select 1 from public.pro_sectors where pro_id = v_offer.pro_id and sector_id = v_sector_id
  ) then raise exception 'professional does not serve this location'; end if;

  perform pg_advisory_xact_lock(hashtext('klipp_booking_pro'), hashtext(v_offer.pro_id::text));
  v_local := p_scheduled_start at time zone 'America/Santo_Domingo';
  v_end_local := (p_scheduled_start + make_interval(mins => v_offer.est_minutes))
    at time zone 'America/Santo_Domingo';
  if v_local::date <> v_end_local::date then raise exception 'service must fit within one local calendar day'; end if;
  if not exists (
    select 1 from public.pro_availability av
    where av.pro_id = v_offer.pro_id
      and av.weekday = extract(isodow from v_local)::smallint
      and av.start_time <= v_local::time and av.end_time >= v_end_local::time
  ) then raise exception 'professional is not available for the full service window'; end if;
  if exists (
    select 1 from public.bookings b
    where b.pro_id = v_offer.pro_id
      and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
      and tstzrange(b.scheduled_start - interval '60 minutes',
                    b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
          && tstzrange(p_scheduled_start,
                       p_scheduled_start + make_interval(mins => v_offer.est_minutes), '[)')
  ) or exists (
    select 1 from public.booking_requests br
    join public.bookings b on b.id = br.booking_id
    where br.pro_id = v_offer.pro_id and br.status = 'pending'
      and br.expires_at > now() and b.status = 'requested'
      and tstzrange(b.scheduled_start - interval '60 minutes',
                    b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
          && tstzrange(p_scheduled_start,
                       p_scheduled_start + make_interval(mins => v_offer.est_minutes), '[)')
  ) then raise exception 'professional already has a booking or pending offer in that time window'; end if;

  insert into public.addresses (client_id, label, street, references_text, sector_id, location)
  values (
    auth.uid(), 'Ubicación de reserva', nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''), v_sector_id,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  ) returning id into v_address_id;

  insert into public.bookings (
    client_id, pro_id, service_type_id, pricing_tier_id, pro_service_id, address_id,
    assignment_mode, status, scheduled_start, est_minutes, price_dop, commission_pct,
    commission_dop, pro_payout_dop, notes, client_lat, client_lng, address_text, landmark_notes
  ) values (
    auth.uid(), v_offer.pro_id, v_offer.service_type_id, null, v_offer.id, v_address_id,
    'manual', 'requested', p_scheduled_start, v_offer.est_minutes, v_offer.base_price_dop,
    v_commission_pct, round(v_offer.base_price_dop * v_commission_pct / 100, 2),
    v_offer.base_price_dop - round(v_offer.base_price_dop * v_commission_pct / 100, 2),
    null, p_lat, p_lng, nullif(trim(p_address_text), ''), nullif(trim(p_landmark_notes), '')
  ) returning id into v_booking_id;

  insert into public.booking_requests (booking_id, pro_id, expires_at)
  values (v_booking_id, v_offer.pro_id, now() + interval '2 hours');
  return v_booking_id;
end;
$$;

create or replace function public.get_booking_queue_info(p_booking_id uuid)
returns table(previous_stops integer, previous_service_in_progress boolean, departure_window timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings
  where id = p_booking_id and (client_id = auth.uid() or pro_id = auth.uid());
  if not found then raise exception 'booking not found'; end if;

  if auth.uid() <> v_booking.client_id then
    raise exception 'only the client can request queue information';
  end if;
  if v_booking.status <> 'scheduled' or v_booking.pro_id is null then return; end if;

  return query
  select count(*)::integer,
         coalesce(bool_or(b.status in ('en_route', 'arrived', 'in_progress')), false),
         v_booking.scheduled_start - interval '30 minutes'
  from public.bookings b
  where b.pro_id = v_booking.pro_id
    and b.id <> v_booking.id
    and b.scheduled_start < v_booking.scheduled_start
    and b.status in ('scheduled', 'en_route', 'arrived', 'in_progress');
end;
$$;

revoke all on function public.get_available_service_slots(uuid, double precision, double precision, date) from public, anon;
revoke all on function public.get_available_pros_at_location(double precision, double precision, timestamptz, integer) from public, anon;
revoke all on function public.get_available_booking_slots_at_location(integer, double precision, double precision, date, assignment_mode) from public, anon;
revoke all on function public.create_tier_booking_at_location(integer, double precision, double precision, text, text, timestamptz, assignment_mode, uuid) from public, anon;
revoke all on function public.save_address_at_location(double precision, double precision, text, text) from public, anon;
revoke all on function public.create_booking_at_location(uuid, double precision, double precision, text, text, timestamptz) from public, anon;
revoke all on function public.get_booking_queue_info(uuid) from public, anon;
grant execute on function public.get_available_service_slots(uuid, double precision, double precision, date) to authenticated;
grant execute on function public.get_available_pros_at_location(double precision, double precision, timestamptz, integer) to authenticated;
grant execute on function public.get_available_booking_slots_at_location(integer, double precision, double precision, date, assignment_mode) to authenticated;
grant execute on function public.create_tier_booking_at_location(integer, double precision, double precision, text, text, timestamptz, assignment_mode, uuid) to authenticated;
grant execute on function public.save_address_at_location(double precision, double precision, text, text) to authenticated;
grant execute on function public.create_booking_at_location(uuid, double precision, double precision, text, text, timestamptz) to authenticated;
grant execute on function public.get_booking_queue_info(uuid) to authenticated;

alter table public.pro_locations replica identity full;
alter table public.bookings replica identity full;
alter table public.messages replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pro_locations') then
    alter publication supabase_realtime add table public.pro_locations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
