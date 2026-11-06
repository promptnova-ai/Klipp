-- Reconstructed from the production schema on 2026-11-06.
-- Manual discovery must only expose professionals who accepted the own-equipment policy.
create or replace function public.get_nearby_service_offers(
  p_service_type_id integer,
  p_latitude double precision,
  p_longitude double precision
)
returns table(
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
set search_path to 'public', 'extensions'
as $function$
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
    and pp.equipment_policy_accepted_at is not null
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
$function$;

-- Direct manual booking must apply the same equipment-policy gate as tier booking.
create or replace function public.create_booking_at_location(
  p_pro_service_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamp with time zone
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_offer public.pro_services%rowtype;
  v_pro public.pro_profiles%rowtype;
  v_client_point extensions.geography;
  v_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_address_id uuid;
  v_booking_id uuid;
  v_commission_pct numeric(5,2) := 7.00;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  if p_scheduled_start <= now() then raise exception 'start must be in the future'; end if;
  select * into v_offer from public.pro_services where id = p_pro_service_id and active;
  if not found then raise exception 'service offer is unavailable'; end if;

  select * into v_pro from public.pro_profiles
  where user_id = v_offer.pro_id
    and active
    and verification_status = 'approved'
    and equipment_policy_accepted_at is not null;
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
$function$;
