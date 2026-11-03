-- Only advertise professionals who have explicitly accepted Klipp's equipment policy.
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
           extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326)::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
         )
  from public.pro_services ps
  join public.pro_profiles pp on pp.user_id = ps.pro_id
  join public.profiles pr on pr.id = pp.user_id
  join public.service_types st on st.id = ps.service_type_id
  where ps.service_type_id = p_service_type_id
    and ps.active
    and st.active
    and pp.active
    and pp.verification_status = 'approved'
    and pp.equipment_policy_accepted_at is not null
    and pp.service_area_latitude is not null
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326)::extensions.geography,
      extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
      pp.service_area_radius_m
    )
  order by 13, pp.rating_avg desc, pp.jobs_completed desc;
end;
$$;

revoke all on function public.get_nearby_service_offers(integer, double precision, double precision) from public, anon;
grant execute on function public.get_nearby_service_offers(integer, double precision, double precision) to authenticated;
