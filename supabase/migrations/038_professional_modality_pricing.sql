-- Professional-defined price and duration per service modality.
alter table public.pricing_tiers drop constraint if exists pricing_tiers_price_dop_check;
alter table public.pricing_tiers add constraint pricing_tiers_price_dop_check check (price_dop >= 0);
create unique index if not exists pricing_tiers_service_label_unique on public.pricing_tiers(service_type_id,label);
update public.pricing_tiers set price_dop=0 where price_dop<>0;
insert into public.pricing_tiers(service_type_id,label,bedrooms,bathrooms,price_dop,est_minutes)
select st.id,v.label,null,null,0,60 from public.service_types st
join (values
('barberia','Corte clásico'),('barberia','Degradado'),('barberia','Arreglo de barba'),('barberia','Afeitado'),
('peluqueria','Corte'),('peluqueria','Lavado y secado'),('peluqueria','Peinados'),('peluqueria','Coloración'),('peluqueria','Trenzas'),('peluqueria','Tratamientos capilares'),
('estetica','Manicura'),('estetica','Pedicura'),('estetica','Maquillaje'),('estetica','Cejas y pestañas'),('estetica','Depilación'),
('carwash','Lavado exterior'),('carwash','Limpieza interior'),('carwash','Lavado completo'),('carwash','Aspirado'),
('detailing','Detailing interior'),('detailing','Detailing exterior'),('detailing','Pulido'),('detailing','Encerado y protección'),('detailing','Limpieza de tapicería'),
('limpieza-oficinas','Puestos de trabajo'),('limpieza-oficinas','Áreas comunes'),('limpieza-oficinas','Baños'),('limpieza-oficinas','Suelos'),('limpieza-oficinas','Cristales'),
('mantenimiento','Plomería'),('mantenimiento','Electricidad'),('mantenimiento','Montaje de muebles'),('mantenimiento','Pintura'),('mantenimiento','Reparaciones generales')
) as v(code,label) on v.code=st.code
where not exists(select 1 from public.pricing_tiers pt where pt.service_type_id=st.id and pt.label=v.label);
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.user_role;
  v_onboarding jsonb;
  v_services jsonb;
  v_service jsonb;
  v_service_type_id integer;
  v_service_code text;
  v_price numeric(10,2);
  v_minutes integer;
  v_lat double precision;
  v_lng double precision;
  v_radius_km numeric;
  v_weekday jsonb;
  v_start time;
  v_end time;
  v_details jsonb;
  v_phone text;
  v_availability_count integer;
  v_tier_prices jsonb;
  v_tier_price jsonb;
  v_tier_id integer;
  v_tier_amount numeric(10,2);
  v_tier_minutes integer;
  v_pro_service_id uuid;
  v_tier_count integer;
  v_tier_distinct_count integer;
begin
  v_role := case
    when new.raw_user_meta_data ->> 'role' = 'pro' then 'pro'::public.user_role
    else 'client'::public.user_role
  end;

  v_phone := coalesce(new.phone, new.raw_user_meta_data ->> 'phone');

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    v_role,
    new.raw_user_meta_data ->> 'full_name',
    v_phone
  );

  if v_role = 'pro' then
    v_onboarding := new.raw_user_meta_data -> 'pro_onboarding';

    if v_onboarding is null then
      insert into public.pro_profiles (user_id) values (new.id);
      return new;
    end if;

    if length(regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g')) < 10 then
      raise exception 'A valid professional contact phone is required';
    end if;

    if coalesce((v_onboarding ->> 'equipment_confirmed')::boolean, false) is not true then
      raise exception 'Professional equipment and materials commitment is required';
    end if;

    v_services := v_onboarding -> 'services';
    if jsonb_typeof(v_services) is distinct from 'array' then
      raise exception 'Professional services must be an array';
    end if;
    if jsonb_array_length(v_services) <> 1 then
      raise exception 'A professional account must register exactly one primary profession';
    end if;

    v_service := v_services -> 0;
    v_service_type_id := (v_service ->> 'service_type_id')::integer;
    v_tier_prices := v_service -> 'tier_prices';
    if jsonb_typeof(v_tier_prices) is distinct from 'array' or jsonb_array_length(v_tier_prices) < 1 or jsonb_array_length(v_tier_prices) > 30 then
      raise exception 'At least one valid priced service modality is required';
    end if;
    select min((value ->> 'price_dop')::numeric), min((value ->> 'est_minutes')::integer) into v_price,v_minutes from jsonb_array_elements(v_tier_prices);
    v_tier_count := jsonb_array_length(v_tier_prices);
    select count(distinct (value ->> 'pricing_tier_id')::integer) into v_tier_distinct_count from jsonb_array_elements(v_tier_prices);
    if v_tier_count <> v_tier_distinct_count then raise exception 'A service modality cannot be priced more than once'; end if;
    v_details := coalesce(v_service -> 'details', '{}'::jsonb);

    if v_price is null or v_price <= 0 or v_minutes is null or v_minutes <= 0 then
      raise exception 'Professional base price and estimated duration must be positive';
    end if;
    if jsonb_typeof(v_details) is distinct from 'object' then
      raise exception 'Profession details must be a JSON object';
    end if;

    select st.code into v_service_code
    from public.service_types st
    where st.id = v_service_type_id
      and st.active
      and st.code <> 'masajes';

    if v_service_code is null then
      raise exception 'Selected profession is not available';
    end if;

    if nullif(trim(v_details ->> 'specialty'), '') is null then
      raise exception 'Profession-specific service details are required';
    end if;

    if v_service_code = 'peluqueria'
       and nullif(trim(v_details ->> 'hair_lengths'), '') is null then
      raise exception 'Hair lengths served are required';
    elsif v_service_code = 'estetica'
       and nullif(trim(v_details ->> 'hygiene'), '') is null then
      raise exception 'A hygiene and instrument description is required';
    elsif v_service_code = 'carwash'
       and nullif(trim(v_details ->> 'utilities'), '') is null then
      raise exception 'Water and energy arrangements are required';
    elsif v_service_code = 'detailing'
       and nullif(trim(v_details ->> 'vehicle_types'), '') is null then
      raise exception 'Vehicle types served are required';
    elsif v_service_code in ('limpieza_regular', 'limpieza-oficinas')
       and nullif(trim(v_details ->> 'frequency'), '') is null then
      raise exception 'Cleaning availability frequency is required';
    elsif v_service_code = 'limpieza_profunda'
       and nullif(trim(v_details ->> 'extras'), '') is null then
      raise exception 'Additional deep-cleaning scope is required';
    elsif v_service_code = 'mantenimiento'
       and nullif(trim(v_details ->> 'tools'), '') is null then
      raise exception 'Maintenance tools and work scope are required';
    end if;

    v_lat := (v_onboarding #>> '{coverage,latitude}')::double precision;
    v_lng := (v_onboarding #>> '{coverage,longitude}')::double precision;
    v_radius_km := (v_onboarding #>> '{coverage,radius_km}')::numeric;

    if v_lat is null or v_lat < -90 or v_lat > 90
       or v_lng is null or v_lng < -180 or v_lng > 180
       or v_radius_km is null or v_radius_km < 1 or v_radius_km > 100 then
      raise exception 'A valid service area is required';
    end if;

    if jsonb_typeof(v_onboarding -> 'availability') is distinct from 'array' then
      raise exception 'Availability must be an array';
    end if;
    v_availability_count := jsonb_array_length(v_onboarding -> 'availability');
    if v_availability_count < 1 or v_availability_count > 7 then
      raise exception 'Select between one and seven availability days';
    end if;

    insert into public.pro_profiles (
      user_id, bio, years_experience, transport_type,
      service_area_latitude, service_area_longitude, service_area_radius_m,
      equipment_policy_accepted_at
    )
    values (
      new.id,
      nullif(trim(v_onboarding ->> 'bio'), ''),
      nullif(v_onboarding ->> 'years_experience', '')::integer,
      nullif(trim(v_onboarding ->> 'transport_type'), ''),
      v_lat, v_lng, round(v_radius_km * 1000)::integer,
      now()
    );

    insert into public.pro_services (
      pro_id, service_type_id, base_price_dop, est_minutes, active, details
    ) values (
      new.id, v_service_type_id, v_price, v_minutes, true, v_details
    ) returning id into v_pro_service_id;

    for v_tier_price in select value from jsonb_array_elements(v_tier_prices) loop
      v_tier_id := (v_tier_price ->> 'pricing_tier_id')::integer;
      v_tier_amount := (v_tier_price ->> 'price_dop')::numeric;
      v_tier_minutes := (v_tier_price ->> 'est_minutes')::integer;
      if v_tier_amount is null or v_tier_amount <= 0 or v_tier_minutes is null or v_tier_minutes <= 0 then
        raise exception 'Every selected modality needs a positive price and duration';
      end if;
      if not exists (select 1 from public.pricing_tiers pt where pt.id=v_tier_id and pt.service_type_id=v_service_type_id) then
        raise exception 'A selected modality does not belong to this profession';
      end if;
      insert into public.pro_service_tier_prices(pro_service_id,pricing_tier_id,price_dop,est_minutes,active)
      values(v_pro_service_id,v_tier_id,v_tier_amount,v_tier_minutes,true);
    end loop;

    for v_weekday in
      select value from jsonb_array_elements(v_onboarding -> 'availability')
    loop
      if (v_weekday ->> 'weekday')::integer not between 1 and 7 then
        raise exception 'Availability weekday must be between 1 and 7';
      end if;

      v_start := (v_weekday ->> 'start_time')::time;
      v_end := (v_weekday ->> 'end_time')::time;
      if v_start is null or v_end is null or v_end <= v_start then
        raise exception 'Availability end time must be later than start time';
      end if;

      insert into public.pro_availability (pro_id, weekday, start_time, end_time)
      values (new.id, (v_weekday ->> 'weekday')::smallint, v_start, v_end);
    end loop;
  end if;

  return new;
end
$function$;
drop function if exists public.get_available_booking_slots_at_location(integer,double precision,double precision,date,public.assignment_mode);
create or replace function public.get_available_booking_slots_at_location(
  p_pricing_tier_id integer,p_lat double precision,p_lng double precision,p_date date,
  p_mode public.assignment_mode default 'manual',p_pro_id uuid default null
) returns table(slot_time time without time zone)
language plpgsql security definer set search_path=public,extensions
as $function$
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
$function$;

create or replace function public.create_tier_booking_at_location(
  p_pricing_tier_id integer,p_lat double precision,p_lng double precision,p_address_text text,
  p_landmark_notes text,p_scheduled_start timestamptz,p_mode public.assignment_mode,p_pro_id uuid default null
) returns uuid language plpgsql security definer set search_path=public,extensions
as $function$
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
$function$;

revoke all on function public.get_available_booking_slots_at_location(integer,double precision,double precision,date,public.assignment_mode,uuid) from public,anon;
grant execute on function public.get_available_booking_slots_at_location(integer,double precision,double precision,date,public.assignment_mode,uuid) to authenticated;
revoke all on function public.create_tier_booking_at_location(integer,double precision,double precision,text,text,timestamptz,public.assignment_mode,uuid) from public,anon;
grant execute on function public.create_tier_booking_at_location(integer,double precision,double precision,text,text,timestamptz,public.assignment_mode,uuid) to authenticated;
