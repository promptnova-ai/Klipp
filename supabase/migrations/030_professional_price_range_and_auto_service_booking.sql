-- Price-safe automatic dispatch for services whose prices are set by each professional.
-- The customer sees the min/max of eligible local offers before dispatch. The exact
-- amount is snapshotted from the professional's active offer only after acceptance.
-- A payment row cannot be created until the customer confirms that exact amount.

alter table public.bookings
  add column if not exists price_min_dop numeric(10,2),
  add column if not exists price_max_dop numeric(10,2),
  add column if not exists price_confirmed_at timestamptz;

alter table public.bookings
  add constraint bookings_price_range_check check (
    (price_min_dop is null and price_max_dop is null)
    or (price_min_dop > 0 and price_max_dop >= price_min_dop)
  );

alter table public.bookings
  drop constraint if exists bookings_service_source_check;

alter table public.bookings
  add constraint bookings_service_source_check check (
    pricing_tier_id is not null
    or pro_service_id is not null
    or (assignment_mode = 'auto' and status in ('requested','expired','cancelled'))
  );

alter table public.booking_requests
  add column if not exists offered_price_dop numeric(10,2),
  add column if not exists offered_payout_dop numeric(10,2),
  add column if not exists offered_est_minutes integer;

create or replace function public.snapshot_request_professional_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  v_booking public.bookings%rowtype;
  v_offer public.pro_services%rowtype;
begin
  select * into v_booking from public.bookings where id=new.booking_id;
  if found and v_booking.assignment_mode='auto'
    and v_booking.pricing_tier_id is null and v_booking.pro_service_id is null then
    select ps.* into v_offer
    from public.pro_services ps
    join public.pro_profiles pp on pp.user_id=ps.pro_id
    where ps.pro_id=new.pro_id and ps.service_type_id=v_booking.service_type_id
      and ps.active and pp.active and pp.verification_status='approved'
      and pp.accepts_auto_assign and pp.equipment_policy_accepted_at is not null;
    if not found then raise exception 'professional no longer offers this service'; end if;
    if v_offer.base_price_dop < v_booking.price_min_dop
      or v_offer.base_price_dop > v_booking.price_max_dop then
      raise exception 'professional tariff is outside the estimate shown to the customer';
    end if;
    new.offered_price_dop := v_offer.base_price_dop;
    new.offered_est_minutes := v_offer.est_minutes;
    new.offered_payout_dop := v_offer.base_price_dop
      - round(v_offer.base_price_dop*v_booking.commission_pct/100,2);
  end if;
  return new;
end;
$;

drop trigger if exists booking_requests_snapshot_professional_offer on public.booking_requests;
create trigger booking_requests_snapshot_professional_offer
before insert on public.booking_requests
for each row execute function public.snapshot_request_professional_offer();
revoke all on function public.snapshot_request_professional_offer() from public,anon,authenticated;

-- Manual choice for professional-priced services. The exact price is already
-- shown on the selected professional's card, so the customer has confirmed it
-- by submitting the request.
-- Scheduled time slots for professional-priced services are based on at least
-- one nearby professional's own availability and published service duration.
create or replace function public.get_available_variable_service_slots_at_location(
  p_lat double precision,
  p_lng double precision,
  p_date date,
  p_service_type_id integer
) returns table(slot_time time)
language plpgsql security definer
set search_path = public, extensions
as $
declare
  v_client_point extensions.geography;
  v_local timestamp without time zone;
  v_start timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid client location';
  end if;
  if p_date is null or p_service_type_id is null then raise exception 'date and service are required'; end if;

  v_client_point:=extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography;
  for v_local in
    select p_date::timestamp+make_interval(mins=>minute_of_day)
    from generate_series(480,1080,30) as slots(minute_of_day)
  loop
    v_start:=v_local at time zone 'America/Santo_Domingo';
    if v_start>now() and exists (
      select 1
      from public.pro_profiles pp
      join public.pro_services ps on ps.pro_id=pp.user_id and ps.service_type_id=p_service_type_id and ps.active
      join public.service_types st on st.id=ps.service_type_id and st.active
      where pp.active and pp.verification_status='approved'
        and pp.equipment_policy_accepted_at is not null
        and pp.service_area_latitude is not null and pp.service_area_longitude is not null
        and extensions.st_dwithin(
          extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
          v_client_point,pp.service_area_radius_m)
        and (v_local+make_interval(mins=>ps.est_minutes))::date=v_local::date
        and exists (
          select 1 from public.pro_availability av
          where av.pro_id=pp.user_id
            and av.weekday=extract(isodow from v_local)::smallint
            and av.start_time<=v_local::time
            and av.end_time>=(v_local+make_interval(mins=>ps.est_minutes))::time)
        and not exists (
          select 1 from public.bookings b
          where b.pro_id=pp.user_id
            and b.status in ('awaiting_payment','scheduled','en_route','arrived','in_progress')
            and tstzrange(b.scheduled_start-interval '60 minutes',
              b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
              && tstzrange(v_start,v_start+make_interval(mins=>ps.est_minutes),'[)'))
        and not exists (
          select 1 from public.booking_requests br
          join public.bookings b on b.id=br.booking_id
          where br.pro_id=pp.user_id and br.status='pending' and br.expires_at>now()
            and b.status='requested'
            and tstzrange(b.scheduled_start-interval '60 minutes',
              b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
              && tstzrange(v_start,v_start+make_interval(mins=>ps.est_minutes),'[)'))
    ) then
      slot_time:=v_local::time;
      return next;
    end if;
  end loop;
end;
$;

revoke all on function public.get_available_variable_service_slots_at_location(double precision,double precision,date,integer) from public,anon;
grant execute on function public.get_available_variable_service_slots_at_location(double precision,double precision,date,integer) to authenticated;

-- Manual discovery for professional-priced services uses each professional's
-- own published duration, rather than the longest duration in the whole area.
create or replace function public.get_available_variable_service_pros_at_location(
  p_lat double precision,
  p_lng double precision,
  p_scheduled_start timestamptz,
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
language sql stable security definer
set search_path = public, extensions
as $
  with point as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography client_point,
      p_scheduled_start at time zone 'America/Santo_Domingo' local_start
  )
  select pp.user_id,profile.full_name,profile.avatar_url,pp.bio,pp.years_experience,
    pp.base_sector_id,pp.rating_avg,pp.rating_count,pp.jobs_completed,
    round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      point.client_point)/1000.0)::numeric,1)
  from point
  join public.pro_profiles pp on pp.active and pp.verification_status='approved'
  join public.profiles profile on profile.id=pp.user_id
  join public.pro_services ps on ps.pro_id=pp.user_id and ps.service_type_id=p_service_type_id and ps.active
  join public.service_types st on st.id=ps.service_type_id and st.active
  where auth.uid() is not null
    and p_lat between -90 and 90 and p_lng between -180 and 180
    and p_scheduled_start>now() and ps.est_minutes>0
    and pp.equipment_policy_accepted_at is not null
    and pp.service_area_latitude is not null and pp.service_area_longitude is not null
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      point.client_point,pp.service_area_radius_m)
    and (point.local_start+make_interval(mins=>ps.est_minutes))::date=point.local_start::date
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id=pp.user_id
        and av.weekday=extract(isodow from point.local_start)::smallint
        and av.start_time<=point.local_start::time
        and av.end_time>=(point.local_start+make_interval(mins=>ps.est_minutes))::time)
    and not exists (
      select 1 from public.bookings b
      where b.pro_id=pp.user_id
        and b.status in ('awaiting_payment','scheduled','en_route','arrived','in_progress')
        and tstzrange(b.scheduled_start-interval '60 minutes',
          b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
          && tstzrange(p_scheduled_start,p_scheduled_start+make_interval(mins=>ps.est_minutes),'[)'))
    and not exists (
      select 1 from public.booking_requests br
      join public.bookings b on b.id=br.booking_id
      where br.pro_id=pp.user_id and br.status='pending' and br.expires_at>now()
        and b.status='requested'
        and tstzrange(b.scheduled_start-interval '60 minutes',
          b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
          && tstzrange(p_scheduled_start,p_scheduled_start+make_interval(mins=>ps.est_minutes),'[)'))
  order by 10 asc,pp.rating_avg desc,pp.jobs_completed desc;
$;

create or replace function public.get_available_immediate_variable_service_pros_at_location(
  p_lat double precision,
  p_lng double precision,
  p_scheduled_start timestamptz,
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
language plpgsql stable security definer
set search_path = public, extensions
as $
declare
  v_client_point extensions.geography;
  v_local_start timestamp without time zone;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid client location';
  end if;
  if p_scheduled_start is null or p_scheduled_start<=now()
    or p_scheduled_start>now()+interval '30 minutes' then
    raise exception 'immediate booking must start within 30 minutes';
  end if;
  if p_service_type_id is null then raise exception 'service is required'; end if;

  v_client_point:=extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography;
  v_local_start:=p_scheduled_start at time zone 'America/Santo_Domingo';

  return query
  select pp.user_id,profile.full_name,profile.avatar_url,pp.bio,pp.years_experience,
    pp.base_sector_id,pp.rating_avg,pp.rating_count,pp.jobs_completed,
    round((extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(presence.longitude,presence.latitude),4326)::extensions.geography,
      v_client_point)/1000.0)::numeric,1)
  from public.pro_presence presence
  join public.pro_profiles pp on pp.user_id=presence.pro_id
  join public.profiles profile on profile.id=pp.user_id
  join public.pro_services ps on ps.pro_id=pp.user_id and ps.service_type_id=p_service_type_id and ps.active
  join public.service_types st on st.id=ps.service_type_id and st.active
  where presence.is_online and presence.last_seen_at>=now()-interval '90 seconds'
    and presence.latitude is not null and presence.longitude is not null
    and pp.active and pp.verification_status='approved'
    and pp.equipment_policy_accepted_at is not null
    and pp.service_area_latitude is not null and pp.service_area_longitude is not null
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      v_client_point,pp.service_area_radius_m)
    and (v_local_start+make_interval(mins=>ps.est_minutes))::date=v_local_start::date
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id=pp.user_id
        and av.weekday=extract(isodow from v_local_start)::smallint
        and av.start_time<=v_local_start::time
        and av.end_time>=(v_local_start+make_interval(mins=>ps.est_minutes))::time)
    and not exists (
      select 1 from public.bookings b
      where b.pro_id=pp.user_id
        and (b.status in ('en_route','arrived','in_progress')
          or (b.status in ('awaiting_payment','scheduled')
            and tstzrange(b.scheduled_start-interval '60 minutes',
              b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
              && tstzrange(p_scheduled_start,p_scheduled_start+make_interval(mins=>ps.est_minutes),'[)'))))
    and not exists (
      select 1 from public.booking_requests br
      join public.bookings b on b.id=br.booking_id
      where br.pro_id=pp.user_id and br.status='pending' and br.expires_at>now()
        and b.status='requested')
  order by extensions.st_distance(
    extensions.st_setsrid(extensions.st_makepoint(presence.longitude,presence.latitude),4326)::extensions.geography,
    v_client_point) asc,pp.rating_avg desc,pp.jobs_completed desc;
end;
$;

revoke all on function public.get_available_variable_service_pros_at_location(double precision,double precision,timestamptz,integer) from public,anon;
grant execute on function public.get_available_variable_service_pros_at_location(double precision,double precision,timestamptz,integer) to authenticated;
revoke all on function public.get_available_immediate_variable_service_pros_at_location(double precision,double precision,timestamptz,integer) from public,anon;
grant execute on function public.get_available_immediate_variable_service_pros_at_location(double precision,double precision,timestamptz,integer) to authenticated;

create or replace function public.create_service_booking_for_professional(
  p_service_type_id integer,
  p_pro_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_expected_price_dop numeric,
  p_immediate boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $
declare
  v_offer public.pro_services%rowtype;
  v_booking_id uuid;
  v_address_id uuid;
  v_client_point extensions.geography;
  v_commission_pct numeric(5,2) := 20.00;
  v_commission numeric(10,2);
  v_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_expiry interval;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_service_type_id is null or p_pro_id is null then raise exception 'service and professional are required'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid client location';
  end if;
  if p_scheduled_start is null or p_scheduled_start <= now() then raise exception 'start must be in the future'; end if;
  if p_immediate and p_scheduled_start > now() + interval '30 minutes' then
    raise exception 'immediate booking must start within 30 minutes';
  end if;

  select ps.* into v_offer
  from public.pro_services ps
  join public.pro_profiles pp on pp.user_id = ps.pro_id
  join public.service_types st on st.id = ps.service_type_id
  where ps.pro_id = p_pro_id
    and ps.service_type_id = p_service_type_id
    and ps.active and st.active and pp.active and pp.verification_status = 'approved'
    and pp.equipment_policy_accepted_at is not null
  for update of ps;
  if not found then raise exception 'professional service offer is unavailable'; end if;
  if p_expected_price_dop is null or v_offer.base_price_dop is distinct from p_expected_price_dop then
    raise exception 'the professional tariff changed; refresh the list and confirm the updated price';
  end if;

  perform pg_advisory_xact_lock(hashtext('klipp_booking_pro'), hashtext(p_pro_id::text));
  v_client_point := extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography;
  if not exists (
    select 1 from public.pro_profiles pp
    where pp.user_id = p_pro_id and pp.service_area_latitude is not null
      and extensions.st_dwithin(
        extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
        v_client_point, pp.service_area_radius_m
      )
  ) then raise exception 'professional does not serve this location'; end if;

  if p_immediate then
    if not exists (
      select 1 from public.get_available_immediate_pros_at_location(
        p_lat,p_lng,p_scheduled_start,v_offer.est_minutes,p_service_type_id
      ) candidate where candidate.pro_id = p_pro_id
    ) then raise exception 'professional is no longer online or available; refresh and choose again'; end if;
  else
    v_local := p_scheduled_start at time zone 'America/Santo_Domingo';
    v_end_local := (p_scheduled_start + make_interval(mins => v_offer.est_minutes)) at time zone 'America/Santo_Domingo';
    if v_local::date <> v_end_local::date then raise exception 'service must fit within one local calendar day'; end if;
    if not exists (
      select 1 from public.pro_availability av
      where av.pro_id=p_pro_id
        and av.weekday=extract(isodow from v_local)::smallint
        and av.start_time<=v_local::time and av.end_time>=v_end_local::time
    ) then raise exception 'professional is not available for the full service window'; end if;
    if exists (
      select 1 from public.bookings b
      where b.pro_id=p_pro_id
        and b.status in ('awaiting_payment','scheduled','en_route','arrived','in_progress')
        and tstzrange(b.scheduled_start-interval '60 minutes',
          b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
          && tstzrange(p_scheduled_start,p_scheduled_start+make_interval(mins=>v_offer.est_minutes),'[)')
    ) or exists (
      select 1 from public.booking_requests br
      join public.bookings b on b.id=br.booking_id
      where br.pro_id=p_pro_id and br.status='pending' and br.expires_at>now()
        and b.status='requested'
    ) then raise exception 'professional already has a booking or pending request'; end if;
  end if;

  insert into public.addresses(client_id,label,street,references_text,sector_id,location)
  values(auth.uid(),'Ubicación de reserva',nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''),null,v_client_point)
  returning id into v_address_id;

  v_commission := round(v_offer.base_price_dop*v_commission_pct/100,2);
  v_expiry := case when p_immediate then interval '45 seconds' else interval '2 hours' end;
  insert into public.bookings(
    client_id,pro_id,service_type_id,pricing_tier_id,pro_service_id,address_id,
    assignment_mode,status,scheduled_start,est_minutes,price_dop,commission_pct,
    commission_dop,pro_payout_dop,client_lat,client_lng,address_text,landmark_notes,
    price_min_dop,price_max_dop,price_confirmed_at
  ) values (
    auth.uid(),p_pro_id,p_service_type_id,null,v_offer.id,v_address_id,
    'manual','requested',p_scheduled_start,v_offer.est_minutes,v_offer.base_price_dop,
    v_commission_pct,v_commission,v_offer.base_price_dop-v_commission,
    p_lat,p_lng,nullif(trim(p_address_text), ''),nullif(trim(p_landmark_notes), ''),
    v_offer.base_price_dop,v_offer.base_price_dop,now()
  ) returning id into v_booking_id;

  insert into public.booking_requests(booking_id,pro_id,expires_at)
  values(v_booking_id,p_pro_id,now()+v_expiry);
  return v_booking_id;
end;
$$;

-- Automatic dispatch for a service with professional-defined pricing.
-- Store the maximum duration to avoid assigning a shorter availability window
-- than the eventual accepted offer requires.
create or replace function public.create_auto_service_booking(
  p_service_type_id integer,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_immediate boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_min numeric(10,2);
  v_max numeric(10,2);
  v_max_minutes integer;
  v_auto_eligible_count integer;
  v_address_id uuid;
  v_booking_id uuid;
  v_client_point extensions.geography;
  v_commission_pct numeric(5,2) := 20.00;
  v_commission numeric(10,2);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_service_type_id is null or p_lat is null or p_lng is null
    or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid service or client location';
  end if;
  if p_scheduled_start is null or p_scheduled_start <= now() then raise exception 'start must be in the future'; end if;
  if p_immediate and p_scheduled_start > now() + interval '30 minutes' then
    raise exception 'immediate booking must start within 30 minutes';
  end if;
  if not exists(select 1 from public.service_types where id=p_service_type_id and active) then
    raise exception 'service is inactive';
  end if;

  v_client_point := extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography;
  select min(ps.base_price_dop), max(ps.base_price_dop), max(ps.est_minutes),
    count(*) filter (where pp.accepts_auto_assign)
  into v_min,v_max,v_max_minutes,v_auto_eligible_count
  from public.pro_services ps
  join public.pro_profiles pp on pp.user_id=ps.pro_id
  join public.service_types st on st.id=ps.service_type_id
  where ps.service_type_id=p_service_type_id and ps.active and st.active
    and pp.active and pp.verification_status='approved'
    and pp.equipment_policy_accepted_at is not null
    and pp.service_area_latitude is not null
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      v_client_point,pp.service_area_radius_m
    );
  if v_min is null or v_max is null or v_max_minutes is null then
    raise exception 'no professional has published a price for this service in your area';
  end if;
  if coalesce(v_auto_eligible_count,0)=0 then
    raise exception 'no professional in your area currently accepts automatic requests; choose a professional manually';
  end if;

  insert into public.addresses(client_id,label,street,references_text,sector_id,location)
  values(auth.uid(),'Ubicación de reserva',nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''),null,v_client_point)
  returning id into v_address_id;

  v_commission := round(v_min*v_commission_pct/100,2);
  insert into public.bookings(
    client_id,pro_id,service_type_id,pricing_tier_id,pro_service_id,address_id,
    assignment_mode,status,scheduled_start,est_minutes,price_dop,commission_pct,
    commission_dop,pro_payout_dop,client_lat,client_lng,address_text,landmark_notes,
    price_min_dop,price_max_dop,price_confirmed_at
  ) values (
    auth.uid(),null,p_service_type_id,null,null,v_address_id,
    'auto','requested',p_scheduled_start,v_max_minutes,v_min,v_commission_pct,
    v_commission,v_min-v_commission,p_lat,p_lng,nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''),v_min,v_max,null
  ) returning id into v_booking_id;

  if p_immediate and not exists (
    select 1 from public.find_auto_candidates(v_booking_id,1)
  ) then
    raise exception 'no online professional is currently available for this service and location; choose manually or try again';
  end if;

  return v_booking_id;
end;
$;

-- Lock the booking row before accepting any request. For a professional-priced
-- automatic booking, snapshot the accepting professional's exact offer atomically.
create or replace function public.respond_to_request(p_request_id uuid,p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_req public.booking_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_offer public.pro_services%rowtype;
  v_commission numeric(10,2);
begin
  select * into v_req from public.booking_requests
  where id=p_request_id and pro_id=auth.uid() and status='pending' and expires_at>now()
  for update;
  if not found then raise exception 'request not found or expired'; end if;

  select * into v_booking from public.bookings where id=v_req.booking_id for update;
  if not found or v_booking.status<>'requested' then raise exception 'booking no longer available'; end if;
  if v_booking.pro_id is not null and v_booking.pro_id<>auth.uid() then
    raise exception 'booking is assigned to another professional';
  end if;

  if p_accept then
    if v_booking.pricing_tier_id is null and v_booking.pro_service_id is null then
      select * into v_offer from public.pro_services
      where pro_id=auth.uid() and service_type_id=v_booking.service_type_id and active
      for update;
      if not found then raise exception 'your service offer is no longer available'; end if;
      if v_req.offered_price_dop is null or v_req.offered_est_minutes is null then
        raise exception 'the professional price was not snapshotted when the offer was sent';
      end if;
      if v_req.offered_price_dop < v_booking.price_min_dop
        or v_req.offered_price_dop > v_booking.price_max_dop then
        raise exception 'the quoted price is outside the estimate shown to the customer';
      end if;
      v_commission := round(v_req.offered_price_dop*v_booking.commission_pct/100,2);
      update public.bookings set
        pro_id=auth.uid(),pro_service_id=v_offer.id,
        est_minutes=v_req.offered_est_minutes,price_dop=v_req.offered_price_dop,
        commission_dop=v_commission,pro_payout_dop=v_req.offered_payout_dop,
        price_confirmed_at=null,status='awaiting_payment',accepted_at=now()
      where id=v_booking.id and status='requested'
        and (pro_id is null or pro_id=auth.uid());
    else
      update public.bookings set
        pro_id=auth.uid(),status='awaiting_payment',accepted_at=now(),
        price_confirmed_at=case
          when pro_service_id is not null then coalesce(price_confirmed_at,now())
          else price_confirmed_at
        end
      where id=v_booking.id and status='requested'
        and (pro_id is null or pro_id=auth.uid());
    end if;
    if not found then raise exception 'booking no longer available'; end if;

    update public.booking_requests set status='accepted',responded_at=now() where id=v_req.id;
    update public.booking_requests set status='expired',responded_at=now()
      where booking_id=v_req.booking_id and id<>v_req.id and status='pending';
  else
    update public.booking_requests set status='rejected',responded_at=now() where id=v_req.id;
    -- Manual requests were pre-targeted. Clear the assignment so the client can
    -- choose another professional or switch to nearby dispatch.
    if v_booking.assignment_mode='manual' then
      update public.bookings set pro_id=null
      where id=v_booking.id and status='requested' and pro_id=auth.uid();
    end if;
  end if;
end;
$$;


-- Keep automatic offers aligned with the range shown to the client. The
-- candidate's current tariff must remain inside the estimate stored at booking time.
create or replace function public.find_auto_candidates(p_booking_id uuid, p_limit integer default 5)
returns table(pro_id uuid, distance_m double precision, rating_avg numeric)
language sql stable security definer set search_path = public, extensions as $
  with b as (
    select bk.id, bk.scheduled_start, bk.est_minutes, bk.service_type_id,
      bk.pricing_tier_id, bk.price_min_dop, bk.price_max_dop,
      extensions.st_setsrid(extensions.st_makepoint(bk.client_lng,bk.client_lat),4326)::extensions.geography point
    from public.bookings bk
    where bk.id=p_booking_id and bk.assignment_mode='auto'
      and bk.status='requested' and bk.pro_id is null
      and bk.client_lat is not null and bk.client_lng is not null
  )
  select pp.user_id,
    extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(pr.longitude,pr.latitude),4326)::extensions.geography,
      b.point
    ),
    pp.rating_avg
  from b
  join public.pro_profiles pp on pp.active
  join public.pro_presence pr on pr.pro_id=pp.user_id
  join public.pro_services ps on ps.pro_id=pp.user_id and ps.service_type_id=b.service_type_id and ps.active
  join public.service_types st on st.id=b.service_type_id and st.active
  where pp.verification_status='approved'
    and pp.accepts_auto_assign
    and pp.equipment_policy_accepted_at is not null
    and pp.service_area_latitude is not null
    and pr.is_online and pr.last_seen_at>=now()-interval '90 seconds'
    and (b.pricing_tier_id is not null
      or (ps.base_price_dop>=b.price_min_dop and ps.base_price_dop<=b.price_max_dop))
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      b.point,pp.service_area_radius_m)
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id=pp.user_id
        and av.weekday=extract(isodow from (b.scheduled_start at time zone 'America/Santo_Domingo'))::smallint
        and av.start_time<=(b.scheduled_start at time zone 'America/Santo_Domingo')::time
        and av.end_time>=((b.scheduled_start+make_interval(mins=>case when b.pricing_tier_id is not null then b.est_minutes else ps.est_minutes end)) at time zone 'America/Santo_Domingo')::time)
    and not exists (
      select 1 from public.bookings ob
      where ob.pro_id=pp.user_id
        and ob.status in ('awaiting_payment','scheduled','en_route','arrived','in_progress')
        and tstzrange(ob.scheduled_start-interval '60 minutes',
          ob.scheduled_start+make_interval(mins=>ob.est_minutes)+interval '60 minutes','[)')
          && tstzrange(b.scheduled_start,b.scheduled_start+make_interval(mins=>case when b.pricing_tier_id is not null then b.est_minutes else ps.est_minutes end),'[)'))
    and not exists (
      select 1 from public.booking_requests old
      where old.booking_id=b.id and old.pro_id=pp.user_id)
    and not exists (
      select 1 from public.booking_requests pending
      join public.bookings ob on ob.id=pending.booking_id
      where pending.pro_id=pp.user_id and pending.status='pending'
        and pending.expires_at>now() and ob.id<>b.id)
  order by 2,pp.rating_avg desc,pp.jobs_completed desc
  limit greatest(1,least(coalesce(p_limit,5),20));
$;

revoke all on function public.find_auto_candidates(uuid,integer) from public,anon,authenticated;
grant execute on function public.find_auto_candidates(uuid,integer) to service_role;

-- The cron dispatcher advances to the next professional after each 45-second
-- request expires and informs the client only when no eligible candidate remains.
create or replace function public.process_scheduled_booking_dispatch()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $
declare
  b record;
  candidate_pro_id uuid;
  lead_minutes integer;
  dispatched integer := 0;
begin
  update public.booking_requests
  set status='expired',responded_at=coalesce(responded_at,now())
  where status='pending' and expires_at<=now();

  for b in
    select bk.id,bk.client_id,bk.scheduled_start,near.distance_m
    from public.bookings bk
    left join lateral (
      select c.distance_m from public.find_auto_candidates(bk.id,1) c limit 1
    ) near on true
    where bk.assignment_mode='auto' and bk.status='requested' and bk.pro_id is null
      and not exists (
        select 1 from public.booking_requests r
        where r.booking_id=bk.id and r.status='pending' and r.expires_at>now())
    order by bk.scheduled_start
    limit 100
  loop
    lead_minutes := case when b.distance_m is null then 60
      else greatest(15,ceil(b.distance_m/350.0)::integer+12) end;

    if b.scheduled_start<=now()+make_interval(mins=>lead_minutes) then
      candidate_pro_id := null;
      select c.pro_id into candidate_pro_id
      from public.find_auto_candidates(b.id,1) c limit 1;

      if candidate_pro_id is not null then
        insert into public.booking_requests(booking_id,pro_id,expires_at)
        values(b.id,candidate_pro_id,now()+interval '45 seconds')
        on conflict (booking_id,pro_id) do nothing;
        if found then dispatched := dispatched+1; end if;
      else
        if b.scheduled_start<=now()+interval '15 minutes' then
          perform public.create_klipp_notification(
            b.client_id,b.id,'booking_search_unavailable',
            'Aún estamos buscando un profesional',
            'Los profesionales disponibles no han podido aceptar todavía. Klipp seguirá buscando; también puedes volver a intentarlo o elegir uno manualmente.',
            jsonb_build_object('bookingId',b.id,'target','client','action','retry_or_choose_professional'),
            'booking-search-unavailable:'||b.id::text,'booking_updates'
          );
        end if;
        if b.scheduled_start<=now()-interval '10 minutes' then
          update public.bookings set status='expired'
          where id=b.id and status='requested' and pro_id is null;
        end if;
      end if;
    end if;
  end loop;
  return dispatched;
end;
$;

revoke all on function public.process_scheduled_booking_dispatch() from public,anon,authenticated;
grant execute on function public.process_scheduled_booking_dispatch() to service_role;

create or replace function public.confirm_booking_price(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set price_confirmed_at=now()
  where id=p_booking_id
    and client_id=auth.uid()
    and status='awaiting_payment'
    and pro_id is not null
    and pro_service_id is not null
    and price_confirmed_at is null;
  if not found then raise exception 'booking price is not awaiting your confirmation'; end if;
end;
$$;

create or replace function public.decline_booking_price(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $
begin
  update public.bookings
  set status='cancelled',
      cancelled_at=now(),
      cancelled_by=auth.uid(),
      cancel_reason='client_declined_professional_price'
  where id=p_booking_id
    and client_id=auth.uid()
    and status='awaiting_payment'
    and pro_service_id is not null
    and price_confirmed_at is null;
  if not found then raise exception 'booking price cannot be declined in its current state'; end if;
end;
$;

revoke all on function public.decline_booking_price(uuid) from public,anon;
grant execute on function public.decline_booking_price(uuid) to authenticated;

-- Tell clients to review the exact professional quote before payment.
create or replace function public.notify_klipp_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $
declare
  v_booking public.bookings%rowtype;
  v_client_title text;
  v_client_body text;
  v_pro_title text;
  v_pro_body text;
begin
  select * into v_booking from public.bookings where id=new.booking_id;
  if not found then return new; end if;

  case new.to_status
    when 'requested' then
      v_client_title := 'Solicitud enviada';
      v_client_body := 'Tu solicitud de servicio se ha registrado en Klipp.';
    when 'awaiting_payment' then
      if v_booking.pro_service_id is not null and v_booking.price_confirmed_at is null then
        v_client_title := 'Confirma el precio definitivo';
        v_client_body := 'Un profesional ha aceptado tu solicitud. Revisa el importe exacto y confírmalo antes de continuar al pago.';
      else
        v_client_title := 'Pago pendiente';
        v_client_body := 'Un profesional ha aceptado tu solicitud. Completa el pago para confirmar la reserva.';
      end if;
      v_pro_title := 'Solicitud aceptada';
      v_pro_body := 'Has aceptado el servicio. Estamos esperando la confirmación del cliente.';
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
    v_booking.client_id,v_booking.id,'booking_status',v_client_title,v_client_body,
    jsonb_build_object('bookingId',v_booking.id,'status',new.to_status,'target','client'),
    'booking:'||v_booking.id::text||':status:'||new.to_status::text||':client',
    'booking_updates'
  );

  if v_booking.pro_id is not null and v_pro_title is not null then
    perform public.create_klipp_notification(
      v_booking.pro_id,v_booking.id,'booking_status',v_pro_title,v_pro_body,
      jsonb_build_object('bookingId',v_booking.id,'status',new.to_status,'target','pro'),
      'booking:'||v_booking.id::text||':status:'||new.to_status::text||':pro',
      'booking_updates'
    );
  end if;
  return new;
end;
$;
revoke all on function public.notify_klipp_booking_status() from public,anon,authenticated;

create or replace function public.guard_payment_price_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id=new.booking_id;
  if not found then raise exception 'booking not found'; end if;
  if v_booking.pro_service_id is not null then
    if v_booking.price_confirmed_at is null then
      raise exception 'customer must confirm the professional price before payment';
    end if;
    if new.amount_dop <> v_booking.price_dop then
      raise exception 'payment amount does not match the confirmed booking price';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard_confirmed_booking_price on public.payments;
create trigger payments_guard_confirmed_booking_price
before insert or update of booking_id,amount_dop on public.payments
for each row execute function public.guard_payment_price_confirmation();

revoke all on function public.create_service_booking_for_professional(integer,uuid,double precision,double precision,text,text,timestamptz,numeric,boolean) from public,anon;
grant execute on function public.create_service_booking_for_professional(integer,uuid,double precision,double precision,text,text,timestamptz,numeric,boolean) to authenticated;
revoke all on function public.create_auto_service_booking(integer,double precision,double precision,text,text,timestamptz,boolean) from public,anon;
grant execute on function public.create_auto_service_booking(integer,double precision,double precision,text,text,timestamptz,boolean) to authenticated;
revoke all on function public.respond_to_request(uuid,boolean) from public,anon;
grant execute on function public.respond_to_request(uuid,boolean) to authenticated;
revoke all on function public.confirm_booking_price(uuid) from public,anon;
grant execute on function public.confirm_booking_price(uuid) to authenticated;
revoke all on function public.guard_payment_price_confirmation() from public,anon,authenticated;
