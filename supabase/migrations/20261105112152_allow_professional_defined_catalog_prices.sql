-- Calculate estimates, availability and booking totals from each professional's modality price.
CREATE OR REPLACE FUNCTION public.get_auto_service_price_estimate(p_service_type_id integer, p_pricing_tier_id integer, p_lat double precision, p_lng double precision)
 RETURNS TABLE(min_price_dop numeric, max_price_dop numeric, professional_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_point extensions.geography;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'invalid location';
  END IF;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  RETURN QUERY
  SELECT
    min(CASE WHEN p_pricing_tier_id IS NULL THEN ps.base_price_dop ELSE tp.price_dop END)::numeric,
    max(CASE WHEN p_pricing_tier_id IS NULL THEN ps.base_price_dop ELSE tp.price_dop END)::numeric,
    count(DISTINCT pp.user_id)::integer
  FROM public.pro_profiles pp
  JOIN public.pro_services ps
    ON ps.pro_id = pp.user_id
   AND ps.service_type_id = p_service_type_id
   AND ps.active
  LEFT JOIN public.pro_service_tier_prices tp
    ON tp.pro_service_id = ps.id
   AND tp.pricing_tier_id = p_pricing_tier_id
   AND tp.active
  WHERE pp.active
    AND pp.verification_status = 'approved'
    AND pp.equipment_policy_accepted_at IS NOT NULL
    AND pp.accepts_auto_assign
    AND pp.service_area_latitude IS NOT NULL
    AND extensions.st_dwithin(
      extensions.st_setsrid(
        extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
      )::extensions.geography,
      v_point,
      pp.service_area_radius_m
    )
    AND (p_pricing_tier_id IS NULL OR tp.price_dop IS NOT NULL);
END;
$function$


CREATE OR REPLACE FUNCTION public.get_available_booking_slots_at_location(p_pricing_tier_id integer, p_lat double precision, p_lng double precision, p_date date, p_mode assignment_mode DEFAULT 'manual'::assignment_mode, p_pro_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot_time time without time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v_tier public.pricing_tiers%rowtype; v_point extensions.geography; v_local timestamp without time zone; v_start timestamptz; v_weekday smallint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid location'; end if;
  if p_mode='auto' and p_pro_id is not null then raise exception 'automatic assignment cannot target one professional'; end if;
  select * into v_tier from public.pricing_tiers where id=p_pricing_tier_id;
  if not found then raise exception 'invalid pricing tier'; end if;
  v_point:=extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography;
  v_weekday:=extract(isodow from p_date)::smallint;
  for v_local in select p_date::timestamp+make_interval(mins=>minute_of_day) from generate_series(480,1080,30) as slots(minute_of_day) loop
    v_start:=v_local at time zone 'America/Santo_Domingo';
    if v_start>now() and exists(
      select 1 from public.pro_profiles pp
      join public.pro_services ps on ps.pro_id=pp.user_id and ps.service_type_id=v_tier.service_type_id and ps.active
      join public.pro_service_tier_prices tp on tp.pro_service_id=ps.id and tp.pricing_tier_id=v_tier.id and tp.active
      join public.pro_availability av on av.pro_id=pp.user_id
      where pp.active and pp.verification_status='approved' and pp.equipment_policy_accepted_at is not null
        and pp.service_area_latitude is not null and (p_pro_id is null or pp.user_id=p_pro_id)
        and (p_mode='manual' or pp.accepts_auto_assign)
        and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,v_point,pp.service_area_radius_m)
        and av.weekday=v_weekday and av.start_time<=v_local::time
        and av.end_time>=(v_local+make_interval(mins=>tp.est_minutes))::time
        and v_local::date=(v_local+make_interval(mins=>tp.est_minutes))::date
        and not exists(select 1 from public.bookings b where b.pro_id=pp.user_id and b.status in ('awaiting_payment','scheduled','en_route','arrived','in_progress')
          and tstzrange(b.scheduled_start-interval '60 minutes',b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
          && tstzrange(v_start,v_start+make_interval(mins=>tp.est_minutes),'[)'))
        and not exists(select 1 from public.booking_requests br join public.bookings b on b.id=br.booking_id
          where br.pro_id=pp.user_id and br.status='pending' and br.expires_at>now() and b.status='requested'
          and tstzrange(b.scheduled_start-interval '60 minutes',b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
          && tstzrange(v_start,v_start+make_interval(mins=>tp.est_minutes),'[)'))
    ) then slot_time:=v_local::time; return next; end if;
  end loop;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_tier_booking_at_location(p_pricing_tier_id integer, p_lat double precision, p_lng double precision, p_address_text text, p_landmark_notes text, p_scheduled_start timestamp with time zone, p_mode assignment_mode, p_pro_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_tier public.pricing_tiers%rowtype; v_pro public.pro_profiles%rowtype; v_pro_service_id uuid;
  v_price numeric(10,2); v_minutes integer; v_point extensions.geography;
  v_local timestamp without time zone; v_end_local timestamp without time zone; v_weekday smallint;
  v_address_id uuid; v_booking_id uuid; v_commission_pct numeric(5,2):=7.00; v_commission numeric(10,2);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid location'; end if;
  if p_scheduled_start<=now() then raise exception 'start must be in the future'; end if;
  if (p_mode='manual' and p_pro_id is null) or (p_mode='auto' and p_pro_id is not null) then raise exception 'invalid professional assignment'; end if;
  select * into v_tier from public.pricing_tiers where id=p_pricing_tier_id;
  if not found then raise exception 'invalid pricing tier'; end if;
  v_point:=extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography;
  if p_mode='manual' then
    select * into v_pro from public.pro_profiles where user_id=p_pro_id and active and verification_status='approved' and equipment_policy_accepted_at is not null;
    if not found or v_pro.service_area_latitude is null then raise exception 'professional is not available in this area'; end if;
    if not extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(v_pro.service_area_longitude,v_pro.service_area_latitude),4326)::extensions.geography,v_point,v_pro.service_area_radius_m) then raise exception 'professional does not serve this location'; end if;
    select ps.id,tp.price_dop,tp.est_minutes into v_pro_service_id,v_price,v_minutes from public.pro_services ps
    join public.pro_service_tier_prices tp on tp.pro_service_id=ps.id
    where ps.pro_id=p_pro_id and ps.service_type_id=v_tier.service_type_id and ps.active and tp.pricing_tier_id=v_tier.id and tp.active;
    if not found then raise exception 'professional has not configured a price for this modality'; end if;
    perform pg_advisory_xact_lock(hashtext('klipp_booking_pro'),hashtext(p_pro_id::text));
    v_local:=p_scheduled_start at time zone 'America/Santo_Domingo';
    v_end_local:=(p_scheduled_start+make_interval(mins=>v_minutes)) at time zone 'America/Santo_Domingo';
    if v_local::date<>v_end_local::date then raise exception 'service must fit within one local calendar day'; end if;
    v_weekday:=extract(isodow from v_local)::smallint;
    if not exists(select 1 from public.pro_availability av where av.pro_id=p_pro_id and av.weekday=v_weekday and av.start_time<=v_local::time and av.end_time>=v_end_local::time) then
      raise exception 'professional is not available for the full service window';
    end if;
    if exists(select 1 from public.bookings b where b.pro_id=p_pro_id and b.status in ('awaiting_payment','scheduled','en_route','arrived','in_progress')
      and tstzrange(b.scheduled_start-interval '60 minutes',b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
      && tstzrange(p_scheduled_start,p_scheduled_start+make_interval(mins=>v_minutes),'[)')
    ) or exists(select 1 from public.booking_requests br join public.bookings b on b.id=br.booking_id
      where br.pro_id=p_pro_id and br.status='pending' and br.expires_at>now() and b.status='requested'
      and tstzrange(b.scheduled_start-interval '60 minutes',b.scheduled_start+make_interval(mins=>b.est_minutes)+interval '60 minutes','[)')
      && tstzrange(p_scheduled_start,p_scheduled_start+make_interval(mins=>v_minutes),'[)')
    ) then raise exception 'professional already has a booking or pending offer in that time window'; end if;
  else
    select min(tp.price_dop),min(tp.est_minutes) into v_price,v_minutes from public.pro_profiles pp
    join public.pro_services ps on ps.pro_id=pp.user_id and ps.service_type_id=v_tier.service_type_id and ps.active
    join public.pro_service_tier_prices tp on tp.pro_service_id=ps.id and tp.pricing_tier_id=v_tier.id and tp.active
    where pp.active and pp.verification_status='approved' and pp.equipment_policy_accepted_at is not null and pp.accepts_auto_assign
      and pp.service_area_latitude is not null
      and extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,v_point,pp.service_area_radius_m);
    if v_price is null or v_minutes is null then raise exception 'no verified professional with a price for this modality covers this location'; end if;
  end if;
  v_commission:=round(v_price*v_commission_pct/100,2);
  insert into public.addresses(client_id,label,street,references_text,sector_id,location)
  values(auth.uid(),'Ubicación de reserva',nullif(trim(p_address_text),''),nullif(trim(p_landmark_notes),''),null,v_point) returning id into v_address_id;
  insert into public.bookings(client_id,pro_id,service_type_id,pricing_tier_id,pro_service_id,address_id,assignment_mode,status,scheduled_start,est_minutes,price_dop,commission_pct,commission_dop,pro_payout_dop,notes,client_lat,client_lng,address_text,landmark_notes)
  values(auth.uid(),p_pro_id,v_tier.service_type_id,v_tier.id,v_pro_service_id,v_address_id,p_mode,'requested',p_scheduled_start,v_minutes,v_price,v_commission_pct,v_commission,v_price-v_commission,nullif(trim(p_landmark_notes),''),p_lat,p_lng,nullif(trim(p_address_text),''),nullif(trim(p_landmark_notes),'')) returning id into v_booking_id;
  if p_mode='manual' then insert into public.booking_requests(booking_id,pro_id,expires_at) values(v_booking_id,p_pro_id,now()+interval '2 hours'); end if;
  return v_booking_id;
end;
$function$

