-- Immediate "Cerca de mí" discovery and direct booking with a live professional.
-- A professional is discoverable only when approved, equipped, online with a fresh
-- heartbeat, within service coverage, scheduled to work, and free of active work/offers.

create or replace function public.get_available_immediate_pros_at_location(
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
  jobs_completed integer,
  distance_km numeric
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_client_point extensions.geography;
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat is null or p_lng is null
    or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid client location';
  end if;
  if p_scheduled_start is null
    or p_scheduled_start <= now()
    or p_scheduled_start > now() + interval '30 minutes' then
    raise exception 'immediate booking must start within the next 30 minutes';
  end if;
  if p_est_minutes is null or p_est_minutes < 1 or p_est_minutes > 600
    or p_service_type_id is null then
    raise exception 'invalid service details';
  end if;

  v_client_point := extensions.st_setsrid(
    extensions.st_makepoint(p_lng, p_lat), 4326
  )::extensions.geography;
  v_local_start := p_scheduled_start at time zone 'America/Santo_Domingo';
  v_local_end := (p_scheduled_start + make_interval(mins => p_est_minutes))
    at time zone 'America/Santo_Domingo';

  if v_local_start::date <> v_local_end::date then
    raise exception 'service must fit within one local calendar day';
  end if;

  return query
  select
    pc.pro_id,
    pc.full_name,
    pc.avatar_url,
    pc.bio,
    pc.years_experience,
    pc.base_sector_id,
    pc.rating_avg,
    pc.rating_count,
    pc.jobs_completed,
    round((
      extensions.st_distance(
        extensions.st_setsrid(
          extensions.st_makepoint(pr.longitude, pr.latitude), 4326
        )::extensions.geography,
        v_client_point
      ) / 1000.0
    )::numeric, 1) as distance_km
  from public.pro_presence pr
  join public.pro_profiles pp on pp.user_id = pr.pro_id
  join public.pro_cards pc on pc.pro_id = pr.pro_id
  where pr.is_online
    and pr.last_seen_at >= now() - interval '90 seconds'
    and pr.latitude is not null
    and pr.longitude is not null
    and pp.active
    and pp.verification_status = 'approved'
    and pp.equipment_policy_accepted_at is not null
    and pp.service_area_latitude is not null
    and extensions.st_dwithin(
      extensions.st_setsrid(
        extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
      )::extensions.geography,
      v_client_point,
      pp.service_area_radius_m
    )
    and exists (
      select 1 from public.pro_services ps
      where ps.pro_id = pp.user_id
        and ps.service_type_id = p_service_type_id
        and ps.active
    )
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id = pp.user_id
        and av.weekday = extract(isodow from v_local_start)::smallint
        and av.start_time <= v_local_start::time
        and av.end_time >= v_local_end::time
    )
    and not exists (
      select 1 from public.bookings b
      where b.pro_id = pp.user_id
        and (
          b.status in ('en_route', 'arrived', 'in_progress')
          or (
            b.status in ('awaiting_payment', 'scheduled')
            and tstzrange(
              b.scheduled_start - interval '60 minutes',
              b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
              '[)'
            ) && tstzrange(
              p_scheduled_start,
              p_scheduled_start + make_interval(mins => p_est_minutes),
              '[)'
            )
          )
        )
    )
    and not exists (
      select 1
      from public.booking_requests br
      join public.bookings b on b.id = br.booking_id
      where br.pro_id = pp.user_id
        and br.status = 'pending'
        and br.expires_at > now()
        and b.status = 'requested'
    )
  order by distance_km asc, pc.rating_avg desc, pc.jobs_completed desc;
end;
$$;

create or replace function public.create_immediate_manual_tier_booking(
  p_pricing_tier_id integer,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_pro_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tier public.pricing_tiers%rowtype;
  v_booking_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_pro_id is null then raise exception 'select a nearby professional'; end if;
  if p_scheduled_start is null
    or p_scheduled_start <= now()
    or p_scheduled_start > now() + interval '30 minutes' then
    raise exception 'immediate booking must start within the next 30 minutes';
  end if;

  select * into v_tier
  from public.pricing_tiers
  where id = p_pricing_tier_id;
  if not found then raise exception 'invalid pricing tier'; end if;

  -- Serialize booking creation for this professional and recheck live presence
  -- inside the same transaction that creates the booking request.
  perform pg_advisory_xact_lock(hashtext('klipp_booking_pro'), hashtext(p_pro_id::text));

  if not exists (
    select 1
    from public.get_available_immediate_pros_at_location(
      p_lat, p_lng, p_scheduled_start, v_tier.est_minutes, v_tier.service_type_id
    ) candidate
    where candidate.pro_id = p_pro_id
  ) then
    raise exception 'professional is no longer online or available; refresh the list and choose another';
  end if;

  v_booking_id := public.create_tier_booking_at_location(
    p_pricing_tier_id,
    p_lat,
    p_lng,
    p_address_text,
    p_landmark_notes,
    p_scheduled_start,
    'manual',
    p_pro_id
  );

  -- Direct immediate requests must expire quickly, not inherit the two-hour
  -- window used for ordinary scheduled requests.
  update public.booking_requests
  set expires_at = now() + interval '45 seconds'
  where booking_id = v_booking_id
    and pro_id = p_pro_id
    and status = 'pending';

  return v_booking_id;
end;
$$;

revoke all on function public.get_available_immediate_pros_at_location(
  double precision, double precision, timestamptz, integer, integer
) from public, anon;
grant execute on function public.get_available_immediate_pros_at_location(
  double precision, double precision, timestamptz, integer, integer
) to authenticated;

revoke all on function public.create_immediate_manual_tier_booking(
  integer, double precision, double precision, text, text, timestamptz, uuid
) from public, anon;
grant execute on function public.create_immediate_manual_tier_booking(
  integer, double precision, double precision, text, text, timestamptz, uuid
) to authenticated;
