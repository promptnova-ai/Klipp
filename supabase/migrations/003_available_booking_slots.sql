-- Return only start times with an approved, active professional available
-- in the client's sector, without exposing private professional schedules.
create or replace function public.get_available_booking_slots(
  p_address_id uuid,
  p_pricing_tier_id int,
  p_date date,
  p_mode assignment_mode default 'manual'
) returns table(slot_time time)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier public.pricing_tiers%rowtype;
  v_sector_id int;
  v_weekday smallint;
  v_slot_local timestamp without time zone;
  v_slot_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select a.sector_id into v_sector_id
  from public.addresses a
  where a.id = p_address_id
    and a.client_id = auth.uid();

  if not found then
    raise exception 'invalid address';
  end if;

  select * into v_tier
  from public.pricing_tiers t
  where t.id = p_pricing_tier_id;

  if not found then
    raise exception 'invalid pricing tier';
  end if;

  v_weekday := extract(isodow from p_date)::smallint;

  for v_slot_local in
    select p_date::timestamp + make_interval(mins => minute_of_day)
    from generate_series(480, 1080, 30) as minute_of_day
  loop
    v_slot_start := v_slot_local at time zone 'America/Santo_Domingo';

    if v_slot_start > now()
      and v_slot_local::date = (v_slot_local + make_interval(mins => v_tier.est_minutes))::date
      and exists (
        select 1
        from public.pro_sectors ps
        join public.pro_profiles p on p.user_id = ps.pro_id
        join public.pro_availability av on av.pro_id = p.user_id
        where ps.sector_id = v_sector_id
          and p.verification_status = 'approved'
          and p.active
          and (p_mode = 'manual' or p.accepts_auto_assign)
          and av.weekday = v_weekday
          and av.start_time <= v_slot_local::time
          and av.end_time >= (v_slot_local + make_interval(mins => v_tier.est_minutes))::time
          and not exists (
            select 1
            from public.bookings b
            where b.pro_id = p.user_id
              and b.status in ('awaiting_payment', 'scheduled', 'en_route', 'arrived', 'in_progress')
              and tstzrange(
                b.scheduled_start - interval '60 minutes',
                b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
                '[)'
              ) && tstzrange(
                v_slot_start,
                v_slot_start + make_interval(mins => v_tier.est_minutes),
                '[)'
              )
          )
          and not exists (
            select 1
            from public.booking_requests br
            join public.bookings b on b.id = br.booking_id
            where br.pro_id = p.user_id
              and br.status = 'pending'
              and br.expires_at > now()
              and b.status = 'requested'
              and tstzrange(
                b.scheduled_start - interval '60 minutes',
                b.scheduled_start + make_interval(mins => b.est_minutes) + interval '60 minutes',
                '[)'
              ) && tstzrange(
                v_slot_start,
                v_slot_start + make_interval(mins => v_tier.est_minutes),
                '[)'
              )
          )
      )
    then
      slot_time := v_slot_local::time;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.get_available_booking_slots(uuid, int, date, assignment_mode) from public, anon;
grant execute on function public.get_available_booking_slots(uuid, int, date, assignment_mode) to authenticated;
