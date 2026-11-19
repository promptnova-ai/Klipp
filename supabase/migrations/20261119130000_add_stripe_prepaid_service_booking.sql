-- Atomic prepaid booking creation for every client booking mode.
-- The client submits an expected quote; the database recalculates it and rejects drift.
create or replace function public.create_stripe_prepaid_service_booking_at_location(
  p_service_type_id integer,
  p_pricing_tier_id integer,
  p_pro_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_expected_price_dop numeric,
  p_expected_est_minutes integer,
  p_mode public.assignment_mode
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_service public.service_types%rowtype;
  v_pro public.pro_profiles%rowtype;
  v_pro_service public.pro_services%rowtype;
  v_price numeric(10,2);
  v_minutes integer;
  v_point extensions.geography;
  v_local timestamp without time zone;
  v_end_local timestamp without time zone;
  v_address_id uuid;
  v_booking_id uuid;
  v_payment_due_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_service_type_id is null
     or p_mode is null
     or p_mode not in ('manual'::public.assignment_mode, 'auto'::public.assignment_mode)
     or (p_mode = 'manual' and p_pro_id is null)
     or (p_mode = 'auto' and p_pro_id is not null)
     or p_lat is null or p_lat not between -90 and 90
     or p_lng is null or p_lng not between -180 and 180
     or p_scheduled_start is null
     or p_expected_price_dop is null or p_expected_price_dop <= 0
     or p_expected_est_minutes is null or p_expected_est_minutes <= 0
     or (p_pricing_tier_id is not null and p_pricing_tier_id <= 0) then
    raise exception 'invalid booking details';
  end if;

  if p_scheduled_start <= clock_timestamp() + interval '5 minutes' then
    raise exception 'booking must start at least five minutes in the future to allow secure checkout';
  end if;

  select * into v_service
  from public.service_types
  where id = p_service_type_id and active;
  if not found then raise exception 'service is no longer available'; end if;

  v_point := extensions.st_setsrid(
    extensions.st_makepoint(p_lng, p_lat), 4326
  )::extensions.geography;

  if p_mode = 'manual' then
    select * into v_pro
    from public.pro_profiles
    where user_id = p_pro_id
      and active
      and verification_status = 'approved'
      and equipment_policy_accepted_at is not null;
    if not found
       or v_pro.service_area_latitude is null
       or v_pro.service_area_longitude is null
       or v_pro.service_area_radius_m is null then
      raise exception 'professional is not eligible to receive this booking';
    end if;

    if not extensions.st_dwithin(
      extensions.st_setsrid(
        extensions.st_makepoint(v_pro.service_area_longitude, v_pro.service_area_latitude), 4326
      )::extensions.geography,
      v_point,
      v_pro.service_area_radius_m
    ) then
      raise exception 'professional does not serve this location';
    end if;

    select * into v_pro_service
    from public.pro_services
    where pro_id = p_pro_id
      and service_type_id = p_service_type_id
      and active;
    if not found then raise exception 'professional has not published this service'; end if;

    if p_pricing_tier_id is null then
      v_price := v_pro_service.base_price_dop;
      v_minutes := v_pro_service.est_minutes;
    else
      select price_dop, est_minutes into v_price, v_minutes
      from public.pro_service_tier_prices
      where pro_service_id = v_pro_service.id
        and pricing_tier_id = p_pricing_tier_id
        and active;
      if not found then raise exception 'professional has not configured this service variant'; end if;
    end if;

    if v_price is distinct from p_expected_price_dop
       or v_minutes is distinct from p_expected_est_minutes then
      raise exception 'professional tariff changed; refresh and confirm the updated price';
    end if;

    v_local := p_scheduled_start at time zone 'America/Santo_Domingo';
    v_end_local := (p_scheduled_start + make_interval(mins => v_minutes))
      at time zone 'America/Santo_Domingo';
    if v_local::date <> v_end_local::date then
      raise exception 'service must fit within one local calendar day';
    end if;

    perform pg_advisory_xact_lock(
      hashtext('klipp_booking_pro'), hashtext(p_pro_id::text)
    );

    if not exists (
      select 1 from public.pro_availability av
      where av.pro_id = p_pro_id
        and av.weekday = extract(isodow from v_local)::smallint
        and av.start_time <= v_local::time
        and av.end_time >= v_end_local::time
    ) then
      raise exception 'professional is not available for the full service window';
    end if;

    if exists (
      select 1 from public.bookings b
      where b.pro_id = p_pro_id
        and b.status in (
          'payment_pending','awaiting_payment','scheduled','en_route','arrived','in_progress'
        )
        and tstzrange(
          b.scheduled_start - interval '60 minutes',
          b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(
          p_scheduled_start,
          p_scheduled_start + make_interval(mins => v_minutes),
          '[)'
        )
    ) or exists (
      select 1
      from public.booking_requests br
      join public.bookings b on b.id = br.booking_id
      where br.pro_id = p_pro_id
        and br.status = 'pending'
        and br.expires_at > clock_timestamp()
        and b.status = 'requested'
        and tstzrange(
          b.scheduled_start - interval '60 minutes',
          b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(
          p_scheduled_start,
          p_scheduled_start + make_interval(mins => v_minutes),
          '[)'
        )
    ) then
      raise exception 'professional already has a booking or pending offer in that time window';
    end if;
  else
    -- Auto mode uses the same published-price rule as the existing discovery
    -- RPC: the lowest available offer is the customer quote; duration is
    -- conservatively selected from the available offers.
    if p_pricing_tier_id is null then
      select min(ps.base_price_dop), max(ps.est_minutes)
      into v_price, v_minutes
      from public.pro_profiles pp
      join public.pro_services ps on ps.pro_id = pp.user_id
      where ps.service_type_id = p_service_type_id
        and ps.active
        and pp.active
        and pp.verification_status = 'approved'
        and pp.equipment_policy_accepted_at is not null
        and pp.accepts_auto_assign
        and pp.service_area_latitude is not null
        and pp.service_area_longitude is not null
        and pp.service_area_radius_m is not null
        and extensions.st_dwithin(
          extensions.st_setsrid(
            extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
          )::extensions.geography,
          v_point,
          pp.service_area_radius_m
        );
    else
      select min(tp.price_dop), max(tp.est_minutes)
      into v_price, v_minutes
      from public.pro_profiles pp
      join public.pro_services ps
        on ps.pro_id = pp.user_id
       and ps.service_type_id = p_service_type_id
       and ps.active
      join public.pro_service_tier_prices tp
        on tp.pro_service_id = ps.id
       and tp.pricing_tier_id = p_pricing_tier_id
       and tp.active
      where pp.active
        and pp.verification_status = 'approved'
        and pp.equipment_policy_accepted_at is not null
        and pp.accepts_auto_assign
        and pp.service_area_latitude is not null
        and pp.service_area_longitude is not null
        and pp.service_area_radius_m is not null
        and extensions.st_dwithin(
          extensions.st_setsrid(
            extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude), 4326
          )::extensions.geography,
          v_point,
          pp.service_area_radius_m
        );
    end if;

    if v_price is null or v_minutes is null then
      raise exception 'no verified professional with a published price covers this location';
    end if;
  end if;

  if v_price is distinct from p_expected_price_dop
     or v_minutes is distinct from p_expected_est_minutes then
    raise exception 'service quote changed; refresh and confirm the updated price';
  end if;

  v_local := p_scheduled_start at time zone 'America/Santo_Domingo';
  v_end_local := (p_scheduled_start + make_interval(mins => v_minutes))
    at time zone 'America/Santo_Domingo';
  if v_local::date <> v_end_local::date then
    raise exception 'service must fit within one local calendar day';
  end if;

  v_payment_due_at := least(
    clock_timestamp() + interval '10 minutes',
    p_scheduled_start - interval '5 minutes'
  );

  insert into public.addresses(
    client_id, label, street, references_text, sector_id, location
  )
  values (
    auth.uid(), 'Ubicación de reserva',
    nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''),
    null, v_point
  )
  returning id into v_address_id;

  insert into public.bookings(
    client_id, pro_id, service_type_id, pricing_tier_id, pro_service_id, address_id,
    assignment_mode, status, scheduled_start, est_minutes, price_dop,
    commission_pct, commission_dop, pro_payout_dop, notes,
    client_lat, client_lng, address_text, landmark_notes,
    payment_due_at, price_locked_at
  )
  values (
    auth.uid(),
    case when p_mode = 'manual' then p_pro_id else null end,
    p_service_type_id, p_pricing_tier_id,
    case when p_mode = 'manual' then v_pro_service.id else null end,
    v_address_id, p_mode, 'payment_pending',
    p_scheduled_start, v_minutes, v_price,
    7.00, round(v_price * 0.07, 2), v_price - round(v_price * 0.07, 2),
    nullif(trim(p_landmark_notes), ''),
    p_lat, p_lng, nullif(trim(p_address_text), ''),
    nullif(trim(p_landmark_notes), ''),
    v_payment_due_at, clock_timestamp()
  )
  returning id into v_booking_id;

  return v_booking_id;
end;
$function$;

revoke all on function public.create_stripe_prepaid_service_booking_at_location(
  integer, integer, uuid, double precision, double precision, text, text,
  timestamptz, numeric, integer, public.assignment_mode
) from public, anon;

grant execute on function public.create_stripe_prepaid_service_booking_at_location(
  integer, integer, uuid, double precision, double precision, text, text,
  timestamptz, numeric, integer, public.assignment_mode
) to authenticated;
