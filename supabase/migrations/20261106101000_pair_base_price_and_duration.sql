-- Keep the base professional tariff and duration paired to the same cheapest modality.
-- Validate and persist the professional onboarding payload at auth signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select (value ->> 'price_dop')::numeric, (value ->> 'est_minutes')::integer
    into v_price, v_minutes
    from jsonb_array_elements(v_tier_prices)
    order by (value ->> 'price_dop')::numeric asc, (value ->> 'est_minutes')::integer asc
    limit 1;
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
