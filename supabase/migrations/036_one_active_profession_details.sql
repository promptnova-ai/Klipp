-- One active primary profession per Klipp PRO account, with atomic onboarding persistence.
-- Existing profiles are preserved. The migration aborts rather than silently deactivating
-- multiple active services belonging to the same professional.

do $$
begin
  if exists (
    select 1 from public.pro_services
    where active is true
    group by pro_id having count(*) > 1
  ) then
    raise exception 'Resolve professionals with multiple active service types before enforcing the one-profession rule';
  end if;
end $$;

alter table public.pro_services
  add column if not exists details jsonb not null default '{}'::jsonb;

create unique index if not exists pro_services_one_active_profession
  on public.pro_services(pro_id)
  where active is true;

comment on column public.pro_services.details is
  'Profession-specific registration details, validated against the active service catalog';

-- The auth.users trigger runs in the same transaction as account creation. When
-- email confirmation is enabled, profile/service/availability data is still saved
-- immediately and does not depend on a later client session.
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
  v_price numeric(10,2);
  v_minutes integer;
  v_lat double precision;
  v_lng double precision;
  v_radius_km numeric;
  v_weekday jsonb;
  v_start time;
  v_end time;
  v_details jsonb;
begin
  v_role := case
    when new.raw_user_meta_data ->> 'role' = 'pro' then 'pro'::public.user_role
    else 'client'::public.user_role
  end;

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    v_role,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone')
  );

  if v_role = 'pro' then
    v_onboarding := new.raw_user_meta_data -> 'pro_onboarding';

    if v_onboarding is null then
      insert into public.pro_profiles (user_id) values (new.id);
      return new;
    end if;

    v_services := v_onboarding -> 'services';
    if jsonb_typeof(v_services) is distinct from 'array'
       or jsonb_array_length(v_services) <> 1 then
      raise exception 'A professional account must register exactly one primary profession';
    end if;

    v_service := v_services -> 0;
    v_service_type_id := (v_service ->> 'service_type_id')::integer;
    v_price := (v_service ->> 'base_price_dop')::numeric;
    v_minutes := (v_service ->> 'est_minutes')::integer;
    v_details := coalesce(v_service -> 'details', '{}'::jsonb);

    if v_price is null or v_price <= 0 or v_minutes is null or v_minutes <= 0 then
      raise exception 'Professional base price and estimated duration must be positive';
    end if;
    if jsonb_typeof(v_details) is distinct from 'object' then
      raise exception 'Profession details must be a JSON object';
    end if;

    if not exists (
      select 1 from public.service_types st
      where st.id = v_service_type_id
        and st.active
        and st.code <> 'masajes'
    ) then
      raise exception 'Selected profession is not available';
    end if;

    v_lat := (v_onboarding #>> '{coverage,latitude}')::double precision;
    v_lng := (v_onboarding #>> '{coverage,longitude}')::double precision;
    v_radius_km := (v_onboarding #>> '{coverage,radius_km}')::numeric;

    if v_lat is null or v_lat < -90 or v_lat > 90
       or v_lng is null or v_lng < -180 or v_lng > 180
       or v_radius_km is null or v_radius_km < 1 or v_radius_km > 100 then
      raise exception 'A valid service area is required';
    end if;

    if jsonb_typeof(v_onboarding -> 'availability') is distinct from 'array'
       or jsonb_array_length(v_onboarding -> 'availability') < 1 then
      raise exception 'At least one availability period is required';
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
    )
    values (
      new.id, v_service_type_id, v_price, v_minutes, true, v_details
    );

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
