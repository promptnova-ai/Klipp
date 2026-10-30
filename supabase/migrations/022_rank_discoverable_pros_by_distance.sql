-- Return approximate straight-line distance and rank directly discoverable pros by proximity.
drop function if exists public.get_available_pros_at_location(
  double precision, double precision, timestamptz, integer, integer
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
  jobs_completed integer,
  distance_km numeric
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with points as (
    select
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as client_point,
      p_scheduled_start at time zone 'America/Santo_Domingo' as local_start,
      (p_scheduled_start + make_interval(mins => p_est_minutes))
        at time zone 'America/Santo_Domingo' as local_end
  )
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
          extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
        )::extensions.geography,
        pt.client_point
      ) / 1000.0
    )::numeric, 1) as distance_km
  from points pt
  join public.pro_profiles pp on pp.active and pp.verification_status = 'approved'
  join public.pro_cards pc on pc.pro_id = pp.user_id
  where p_lat between -90 and 90
    and p_lng between -180 and 180
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
        and tstzrange(
          b.scheduled_start - interval '60 minutes',
          b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(p_scheduled_start, p_scheduled_start + make_interval(mins => p_est_minutes), '[)')
    )
    and not exists (
      select 1 from public.booking_requests br
      join public.bookings b on b.id = br.booking_id
      where br.pro_id = pp.user_id
        and br.status = 'pending'
        and br.expires_at > now()
        and b.status = 'requested'
        and tstzrange(
          b.scheduled_start - interval '60 minutes',
          b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(p_scheduled_start, p_scheduled_start + make_interval(mins => p_est_minutes), '[)')
    )
  order by distance_km asc, pc.rating_avg desc, pc.jobs_completed desc;
$$;

revoke all on function public.get_available_pros_at_location(
  double precision, double precision, timestamptz, integer, integer
) from public, anon;
grant execute on function public.get_available_pros_at_location(
  double precision, double precision, timestamptz, integer, integer
) to authenticated;
