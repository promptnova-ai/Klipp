-- =====================================================================
-- Migration 002: professional booking visibility and server-side availability
-- Schema contract: supabase/migrations/001_schema.sql
-- =====================================================================

-- A professional can read a booking while its request is actionable, and
-- continue reading it after acceptance. Rejected/expired requests stop granting
-- access to the client's booking details.
drop policy if exists bookings_select_request_recipient on public.bookings;
create policy bookings_select_request_recipient
  on public.bookings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.booking_requests br
      where br.booking_id = bookings.id
        and br.pro_id = auth.uid()
        and (
          (br.status = 'pending' and br.expires_at > now())
          or br.status = 'accepted'
        )
    )
  );

-- The booking visibility policy above also constrains this address lookup.
drop policy if exists addresses_select_request_recipient on public.addresses;
create policy addresses_select_request_recipient
  on public.addresses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      join public.booking_requests br on br.booking_id = b.id
      where b.address_id = addresses.id
        and br.pro_id = auth.uid()
        and (
          (br.status = 'pending' and br.expires_at > now())
          or br.status = 'accepted'
        )
    )
  );

-- Preserve the original RPC contract and server-calculated price/commission.
-- Manual requests must fit the pro's weekly schedule and avoid existing jobs
-- (including still-pending offers) with the project's 60-minute traffic buffer.
create or replace function public.create_booking(
  p_pricing_tier_id  int,
  p_address_id       uuid,
  p_scheduled_start  timestamptz,
  p_mode             assignment_mode,
  p_pro_id           uuid default null,
  p_notes            text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier           public.pricing_tiers%rowtype;
  v_booking        uuid;
  v_commission_pct numeric(5,2) := 20.00;
  v_commission     numeric(10,2);
  v_start_local    timestamp without time zone;
  v_end_local      timestamp without time zone;
  v_weekday        smallint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.addresses
    where id = p_address_id
      and client_id = auth.uid()
  ) then
    raise exception 'invalid address';
  end if;

  if p_scheduled_start <= now() then
    raise exception 'start must be in the future';
  end if;

  select * into v_tier
  from public.pricing_tiers
  where id = p_pricing_tier_id;

  if not found then
    raise exception 'invalid pricing tier';
  end if;

  if p_mode = 'manual' then
    if p_pro_id is null then
      raise exception 'pro required for manual mode';
    end if;

    if not exists (
      select 1
      from public.pro_profiles p
      join public.pro_sectors ps on ps.pro_id = p.user_id
      join public.addresses a on a.sector_id = ps.sector_id
      where p.user_id = p_pro_id
        and p.verification_status = 'approved'
        and p.active
        and a.id = p_address_id
    ) then
      raise exception 'pro not available in that sector';
    end if;

    -- Serialize requests for the same professional so concurrent clients
    -- cannot both pass the availability/overlap checks.
    perform pg_advisory_xact_lock(hashtext('klipp_booking_pro'), hashtext(p_pro_id::text));

    v_start_local := p_scheduled_start at time zone 'America/Santo_Domingo';
    v_end_local := (p_scheduled_start + make_interval(mins => v_tier.est_minutes))
      at time zone 'America/Santo_Domingo';

    if v_start_local::date <> v_end_local::date then
      raise exception 'service must fit within one local calendar day';
    end if;

    v_weekday := extract(isodow from v_start_local)::smallint;

    if not exists (
      select 1
      from public.pro_availability av
      where av.pro_id = p_pro_id
        and av.weekday = v_weekday
        and av.start_time <= v_start_local::time
        and av.end_time >= v_end_local::time
    ) then
      raise exception 'professional is not available for the full service window';
    end if;

    if exists (
      select 1
      from public.bookings b
      where b.pro_id = p_pro_id
        and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
        and tstzrange(
          b.scheduled_start - interval '60 minutes',
          b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(
          p_scheduled_start,
          p_scheduled_start + make_interval(mins => v_tier.est_minutes),
          '[)'
        )
    ) or exists (
      select 1
      from public.booking_requests br
      join public.bookings b on b.id = br.booking_id
      where br.pro_id = p_pro_id
        and br.status = 'pending'
        and br.expires_at > now()
        and b.status = 'requested'
        and tstzrange(
          b.scheduled_start - interval '60 minutes',
          b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
          '[)'
        ) && tstzrange(
          p_scheduled_start,
          p_scheduled_start + make_interval(mins => v_tier.est_minutes),
          '[)'
        )
    ) then
      raise exception 'professional already has a booking or pending offer in that time window';
    end if;
  elsif p_pro_id is not null then
    raise exception 'pro id is only valid for manual assignment';
  end if;

  v_commission := round(v_tier.price_dop * v_commission_pct / 100, 2);

  insert into public.bookings (
    client_id,
    service_type_id,
    pricing_tier_id,
    address_id,
    assignment_mode,
    scheduled_start,
    est_minutes,
    price_dop,
    commission_pct,
    commission_dop,
    pro_payout_dop,
    notes
  ) values (
    auth.uid(),
    v_tier.service_type_id,
    v_tier.id,
    p_address_id,
    p_mode,
    p_scheduled_start,
    v_tier.est_minutes,
    v_tier.price_dop,
    v_commission_pct,
    v_commission,
    v_tier.price_dop - v_commission,
    p_notes
  ) returning id into v_booking;

  if p_mode = 'manual' then
    insert into public.booking_requests (booking_id, pro_id, expires_at)
    values (v_booking, p_pro_id, now() + interval '2 hours');
  end if;

  return v_booking;
end;
$$;
