-- Replace manual service sectors with a private GPS center and a service radius.
alter table public.addresses
  alter column sector_id drop not null;

alter table public.pro_profiles
  add column service_area_latitude double precision,
  add column service_area_longitude double precision,
  add column service_area_radius_m integer,
  add constraint pro_service_area_coordinate_pair_check
    check ((service_area_latitude is null) = (service_area_longitude is null)),
  add constraint pro_service_area_radius_check
    check (
      (service_area_latitude is null and service_area_radius_m is null)
      or (
        service_area_latitude between -90 and 90
        and service_area_longitude between -180 and 180
        and service_area_radius_m between 1000 and 100000
      )
    );

create index pro_service_area_location_idx
  on public.pro_profiles using gist (
    (extensions.st_setsrid(
      extensions.st_makepoint(service_area_longitude, service_area_latitude),
      4326
    )::extensions.geography)
  )
  where service_area_latitude is not null;

create or replace function public.save_pro_service_area(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_m integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid service area center';
  end if;
  if p_radius_m is null or p_radius_m not between 1000 and 100000 then
    raise exception 'service radius must be between 1 and 100 kilometers';
  end if;

  update public.pro_profiles
  set service_area_latitude = p_latitude,
      service_area_longitude = p_longitude,
      service_area_radius_m = p_radius_m
  where user_id = auth.uid();
  if not found then raise exception 'professional profile not found'; end if;
end;
$$;

create or replace function public.get_nearby_service_offers(
  p_service_type_id integer,
  p_latitude double precision,
  p_longitude double precision
) returns table(
  id uuid,
  pro_id uuid,
  service_type_id integer,
  base_price_dop numeric,
  est_minutes integer,
  pro_name text,
  avatar_url text,
  bio text,
  years_experience integer,
  rating_avg numeric,
  rating_count integer,
  jobs_completed integer,
  distance_m double precision
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid client location';
  end if;

  return query
  select ps.id, ps.pro_id, ps.service_type_id, ps.base_price_dop, ps.est_minutes,
         pr.full_name, pr.avatar_url, pp.bio, pp.years_experience,
         pp.rating_avg, pp.rating_count, pp.jobs_completed,
         extensions.st_distance(
           extensions.st_setsrid(
             extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude),
             4326
           )::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
         )
  from public.pro_services ps
  join public.pro_profiles pp on pp.user_id = ps.pro_id
  join public.profiles pr on pr.id = pp.user_id
  where ps.service_type_id = p_service_type_id
    and ps.active
    and pp.active
    and pp.verification_status = 'approved'
    and pp.service_area_latitude is not null
    and extensions.st_dwithin(
      extensions.st_setsrid(
        extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude),
        4326
      )::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
      pp.service_area_radius_m
    )
  order by 13, pp.rating_avg desc, pp.jobs_completed desc;
end;
$$;

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
  v_pro public.pro_profiles%rowtype;
  v_client_point extensions.geography;
  v_area_point extensions.geography;
  v_local timestamp without time zone;
  v_start timestamptz;
  v_weekday smallint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;

  select * into v_offer from public.pro_services
  where id = p_pro_service_id and active;
  if not found then raise exception 'service offer is unavailable'; end if;
  select * into v_pro from public.pro_profiles
  where user_id = v_offer.pro_id and active and verification_status = 'approved';
  if not found or v_pro.service_area_latitude is null then
    raise exception 'service offer is unavailable';
  end if;

  v_client_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  v_area_point := extensions.st_setsrid(
    extensions.st_makepoint(v_pro.service_area_longitude, v_pro.service_area_latitude), 4326
  )::extensions.geography;
  if not extensions.st_dwithin(v_area_point, v_client_point, v_pro.service_area_radius_m) then
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

drop function if exists public.get_available_pros_at_location(
  double precision, double precision, timestamptz, integer
);

create function public.get_available_pros_at_location(
  p_lat double precision,
  p_lng double precision,
  p_scheduled_start timestamptz,
  p_est_minutes integer,
  p_service_type_id integer
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
  with points as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as client_point,
           p_scheduled_start at time zone 'America/Santo_Domingo' as local_start,
           (p_scheduled_start + make_interval(mins => p_est_minutes))
             at time zone 'America/Santo_Domingo' as local_end
  )
  select pc.pro_id, pc.full_name, pc.avatar_url, pc.bio, pc.years_experience,
         pc.base_sector_id, pc.rating_avg, pc.rating_count, pc.jobs_completed
  from points pt
  join public.pro_profiles pp on pp.active and pp.verification_status = 'approved'
  join public.pro_cards pc on pc.pro_id = pp.user_id
  where p_lat between -90 and 90 and p_lng between -180 and 180
    and p_est_minutes > 0
    and p_scheduled_start > now()
    and pp.service_area_latitude is not null
    and exists (
      select 1 from public.pro_services ps
      where ps.pro_id = pp.user_id
        and ps.service_type_id = p_service_type_id
        and ps.active
    )
    and extensions.st_dwithin(
      extensions.st_setsrid(
        extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
      )::extensions.geography,
      pt.client_point,
      pp.service_area_radius_m
    )
    and pt.local_start::date = pt.local_end::date
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id = pp.user_id
        and av.weekday = extract(isodow from pt.local_start)::smallint
        and av.start_time <= pt.local_start::time
        and av.end_time >= pt.local_end::time
    )
    and not exists (
      select 1 from public.bookings b
      where b.pro_id = pp.user_id
        and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
        and tstzrange(b.scheduled_start - interval '60 minutes',
                      b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
            && tstzrange(p_scheduled_start, p_scheduled_start + make_interval(mins => p_est_minutes), '[)')
    )
    and not exists (
      select 1 from public.booking_requests br
      join public.bookings b on b.id = br.booking_id
      where br.pro_id = pp.user_id and br.status = 'pending'
        and br.expires_at > now() and b.status = 'requested'
        and tstzrange(b.scheduled_start - interval '60 minutes',
                      b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
            && tstzrange(p_scheduled_start, p_scheduled_start + make_interval(mins => p_est_minutes), '[)')
    )
  order by pc.rating_avg desc, pc.jobs_completed desc
$$;

revoke all on function public.get_available_pros_at_location(
  double precision, double precision, timestamptz, integer, integer
) from public, anon;
grant execute on function public.get_available_pros_at_location(
  double precision, double precision, timestamptz, integer, integer
) to authenticated;

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
  v_client_point extensions.geography;
  v_local timestamp without time zone;
  v_start timestamptz;
  v_weekday smallint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  select * into v_tier from public.pricing_tiers where id = p_pricing_tier_id;
  if not found then raise exception 'invalid pricing tier'; end if;
  v_client_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  v_weekday := extract(isodow from p_date)::smallint;

  for v_local in
    select p_date::timestamp + make_interval(mins => minute_of_day)
    from generate_series(480, 1080, 30) as slots(minute_of_day)
  loop
    v_start := v_local at time zone 'America/Santo_Domingo';
    if v_start > now()
      and v_local::date = (v_local + make_interval(mins => v_tier.est_minutes))::date
      and exists (
        select 1 from public.pro_profiles pp
        join public.pro_availability av on av.pro_id = pp.user_id
        where pp.active and pp.verification_status = 'approved'
          and pp.service_area_latitude is not null
          and exists (
            select 1 from public.pro_services ps
            where ps.pro_id = pp.user_id
              and ps.service_type_id = v_tier.service_type_id
              and ps.active
          )
          and (p_mode = 'manual' or pp.accepts_auto_assign)
          and extensions.st_dwithin(
            extensions.st_setsrid(
              extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
            )::extensions.geography,
            v_client_point,
            pp.service_area_radius_m
          )
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
  v_tier public.pricing_tiers%rowtype;
  v_pro public.pro_profiles%rowtype;
  v_client_point extensions.geography;
  v_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_weekday smallint;
  v_address_id uuid;
  v_booking_id uuid;
  v_commission_pct numeric(5,2) := 20.00;
  v_commission numeric(10,2);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  if p_scheduled_start <= now() then raise exception 'start must be in the future'; end if;
  if (p_mode = 'manual' and p_pro_id is null) or (p_mode = 'auto' and p_pro_id is not null) then
    raise exception 'invalid professional assignment';
  end if;

  select * into v_tier from public.pricing_tiers where id = p_pricing_tier_id;
  if not found then raise exception 'invalid pricing tier'; end if;
  v_client_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  if p_mode = 'manual' then
    select * into v_pro from public.pro_profiles
    where user_id = p_pro_id and active and verification_status = 'approved';
    if not found or v_pro.service_area_latitude is null then
      raise exception 'professional is not available in this area';
    end if;
    if not extensions.st_dwithin(
      extensions.st_setsrid(
        extensions.st_makepoint(v_pro.service_area_longitude, v_pro.service_area_latitude), 4326
      )::extensions.geography,
      v_client_point,
      v_pro.service_area_radius_m
    ) then raise exception 'professional does not serve this location'; end if;
    if not exists (
      select 1 from public.pro_services ps
      where ps.pro_id = p_pro_id
        and ps.service_type_id = v_tier.service_type_id
        and ps.active
    ) then raise exception 'professional does not offer this service'; end if;

    perform pg_advisory_xact_lock(hashtext('klipp_booking_pro'), hashtext(p_pro_id::text));
    v_local := p_scheduled_start at time zone 'America/Santo_Domingo';
    v_end_local := (p_scheduled_start + make_interval(mins => v_tier.est_minutes))
      at time zone 'America/Santo_Domingo';
    if v_local::date <> v_end_local::date then
      raise exception 'service must fit within one local calendar day';
    end if;
    v_weekday := extract(isodow from v_local)::smallint;
    if not exists (
      select 1 from public.pro_availability av
      where av.pro_id = p_pro_id and av.weekday = v_weekday
        and av.start_time <= v_local::time and av.end_time >= v_end_local::time
    ) then raise exception 'professional is not available for the full service window'; end if;
    if exists (
      select 1 from public.bookings b
      where b.pro_id = p_pro_id
        and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
        and tstzrange(b.scheduled_start - interval '60 minutes',
                      b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
            && tstzrange(p_scheduled_start, p_scheduled_start + make_interval(mins => v_tier.est_minutes), '[)')
    ) or exists (
      select 1 from public.booking_requests br
      join public.bookings b on b.id = br.booking_id
      where br.pro_id = p_pro_id and br.status = 'pending'
        and br.expires_at > now() and b.status = 'requested'
        and tstzrange(b.scheduled_start - interval '60 minutes',
                      b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
            && tstzrange(p_scheduled_start, p_scheduled_start + make_interval(mins => v_tier.est_minutes), '[)')
    ) then raise exception 'professional already has a booking or pending offer in that time window'; end if;
  end if;

  insert into public.addresses (client_id, label, street, references_text, sector_id, location)
  values (
    auth.uid(), 'Ubicación de reserva', nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''), null,
    v_client_point
  ) returning id into v_address_id;

  v_commission := round(v_tier.price_dop * v_commission_pct / 100, 2);
  insert into public.bookings (
    client_id, pro_id, service_type_id, pricing_tier_id, address_id,
    assignment_mode, status, scheduled_start, est_minutes, price_dop,
    commission_pct, commission_dop, pro_payout_dop, notes,
    client_lat, client_lng, address_text, landmark_notes
  ) values (
    auth.uid(), p_pro_id, v_tier.service_type_id, v_tier.id, v_address_id,
    p_mode, 'requested', p_scheduled_start, v_tier.est_minutes, v_tier.price_dop,
    v_commission_pct, v_commission, v_tier.price_dop - v_commission,
    nullif(trim(p_landmark_notes), ''), p_lat, p_lng,
    nullif(trim(p_address_text), ''), nullif(trim(p_landmark_notes), '')
  ) returning id into v_booking_id;

  if p_mode = 'manual' then
    insert into public.booking_requests (booking_id, pro_id, expires_at)
    values (v_booking_id, p_pro_id, now() + interval '2 hours');
  end if;
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
  v_address_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  insert into public.addresses (client_id, label, street, references_text, sector_id, location)
  values (
    auth.uid(), 'Ubicación guardada', nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''), null,
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
  v_pro public.pro_profiles%rowtype;
  v_client_point extensions.geography;
  v_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_address_id uuid;
  v_booking_id uuid;
  v_commission_pct numeric(5,2) := 20.00;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  if p_scheduled_start <= now() then raise exception 'start must be in the future'; end if;
  select * into v_offer from public.pro_services
  where id = p_pro_service_id and active;
  if not found then raise exception 'service offer is unavailable'; end if;

  select * into v_pro from public.pro_profiles
  where user_id = v_offer.pro_id and active and verification_status = 'approved';
  if not found or v_pro.service_area_latitude is null then
    raise exception 'professional is not available in this area';
  end if;
  v_client_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  if not extensions.st_dwithin(
    extensions.st_setsrid(
      extensions.st_makepoint(v_pro.service_area_longitude, v_pro.service_area_latitude), 4326
    )::extensions.geography,
    v_client_point,
    v_pro.service_area_radius_m
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
    nullif(trim(p_landmark_notes), ''), null, v_client_point
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
    nullif(trim(p_landmark_notes), ''), p_lat, p_lng,
    nullif(trim(p_address_text), ''), nullif(trim(p_landmark_notes), '')
  ) returning id into v_booking_id;

  insert into public.booking_requests (booking_id, pro_id, expires_at)
  values (v_booking_id, v_offer.pro_id, now() + interval '2 hours');
  return v_booking_id;
end;
$$;

create or replace function public.find_auto_candidates(p_booking_id uuid, p_limit integer default 5)
returns table(pro_id uuid, distance_m double precision, rating_avg numeric)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with booking_location as (
    select b.id, b.scheduled_start, b.est_minutes, b.service_type_id,
           extensions.st_setsrid(extensions.st_makepoint(b.client_lng, b.client_lat), 4326)::extensions.geography as client_point
    from public.bookings b
    where b.id = p_booking_id
      and b.assignment_mode = 'auto'
      and b.status = 'requested'
      and b.client_lat is not null
      and b.client_lng is not null
  )
  select pp.user_id,
         extensions.st_distance(
           extensions.st_setsrid(
             extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
           )::extensions.geography,
           bl.client_point
         ),
         pp.rating_avg
  from booking_location bl
  join public.pro_profiles pp on pp.active
  where pp.verification_status = 'approved'
    and pp.accepts_auto_assign
    and pp.service_area_latitude is not null
    and exists (
      select 1 from public.pro_services ps
      where ps.pro_id = pp.user_id
        and ps.service_type_id = bl.service_type_id
        and ps.active
    )
    and extensions.st_dwithin(
      extensions.st_setsrid(
        extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
      )::extensions.geography,
      bl.client_point,
      pp.service_area_radius_m
    )
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id = pp.user_id
        and av.weekday = extract(isodow from (bl.scheduled_start at time zone 'America/Santo_Domingo'))::smallint
        and av.start_time <= (bl.scheduled_start at time zone 'America/Santo_Domingo')::time
        and av.end_time >= ((bl.scheduled_start + make_interval(mins => bl.est_minutes))
          at time zone 'America/Santo_Domingo')::time
    )
    and not exists (
      select 1 from public.bookings b
      where b.pro_id = pp.user_id
        and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
        and tstzrange(b.scheduled_start - interval '60 minutes',
                      b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes', '[)')
            && tstzrange(bl.scheduled_start, bl.scheduled_start + make_interval(mins => bl.est_minutes), '[)')
    )
    and not exists (
      select 1 from public.booking_requests br
      join public.bookings b on b.id = br.booking_id
      where br.booking_id = bl.id and br.pro_id = pp.user_id
        and br.status = 'pending' and br.expires_at > now()
    )
  order by 2, pp.rating_avg desc
  limit greatest(1, least(p_limit, 20))
$$;

revoke all on function public.save_pro_service_area(double precision, double precision, integer) from public, anon;
revoke all on function public.get_nearby_service_offers(integer, double precision, double precision) from public, anon;
grant execute on function public.save_pro_service_area(double precision, double precision, integer) to authenticated;
grant execute on function public.get_nearby_service_offers(integer, double precision, double precision) to authenticated;
