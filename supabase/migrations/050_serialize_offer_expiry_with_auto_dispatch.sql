-- Keep one lock order for every automatic-offer expiry path:
-- booking advisory lock first, booking_requests row lock second.
-- This matches respond_to_request() and prevents expiry/accept deadlocks.

create or replace function public.pro_expire_booking_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_booking_id uuid;
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select booking_id
  into v_booking_id
  from public.booking_requests
  where id = p_request_id
    and pro_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  if v_booking_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('klipp_auto_dispatch'),
    hashtext(v_booking_id::text)
  );

  update public.booking_requests
  set status = 'expired',
      responded_at = coalesce(responded_at, now())
  where id = p_request_id
    and pro_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

revoke all on function public.pro_expire_booking_request(uuid) from public, anon;
grant execute on function public.pro_expire_booking_request(uuid) to authenticated;

create or replace function public.process_scheduled_booking_dispatch()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  b record;
  expired_booking record;
  lead_minutes integer;
  dispatched integer := 0;
  created_now integer := 0;
begin
  -- Expire requests one booking at a time, acquiring the same advisory lock
  -- used by accept/reject before touching any booking_requests row.
  for expired_booking in
    select distinct booking_id
    from public.booking_requests
    where status = 'pending'
      and expires_at <= now()
    order by booking_id
  loop
    perform pg_advisory_xact_lock(
      hashtext('klipp_auto_dispatch'),
      hashtext(expired_booking.booking_id::text)
    );

    update public.booking_requests
    set status = 'expired',
        responded_at = coalesce(responded_at, now())
    where booking_id = expired_booking.booking_id
      and status = 'pending'
      and expires_at <= now();
  end loop;

  for b in
    select bk.id, bk.scheduled_start, near.distance_m
    from public.bookings bk
    left join lateral (
      select c.distance_m
      from public.find_auto_candidates(bk.id, 1) c
      limit 1
    ) near on true
    where bk.assignment_mode = 'auto'
      and bk.status = 'requested'
      and bk.pro_id is null
      and not exists (
        select 1
        from public.booking_requests r
        where r.booking_id = bk.id
          and r.status = 'pending'
          and r.expires_at > now()
      )
    order by bk.scheduled_start
    limit 100
  loop
    -- Approx. 21 km/h travel speed plus 12 minutes for acceptance/preparation.
    -- If nobody eligible is online yet, start looking one hour before the slot.
    lead_minutes := case
      when b.distance_m is null then 60
      else greatest(15, ceil(b.distance_m / 350.0)::integer + 12)
    end;

    if b.scheduled_start <= now() + make_interval(mins => lead_minutes) then
      created_now := public.dispatch_auto_booking(b.id);
      dispatched := dispatched + created_now;

      if created_now = 0
         and b.scheduled_start <= now() - interval '10 minutes'
         and not exists (
           select 1
           from public.booking_requests r
           where r.booking_id = b.id
             and r.status = 'pending'
             and r.expires_at > now()
         ) then
        update public.bookings
        set status = 'expired'
        where id = b.id
          and status = 'requested'
          and pro_id is null;
      end if;
    end if;
  end loop;

  return dispatched;
end;
$function$;
