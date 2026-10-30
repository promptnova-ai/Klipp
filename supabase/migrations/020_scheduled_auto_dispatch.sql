-- Hold future auto bookings until a nearby, online professional can travel on time.
create or replace function public.apply_booking_request_expiry()
returns trigger language plpgsql security definer set search_path = public as $$
declare expiry_minutes integer;
begin
  if new.expires_at is null then
    select (value #>> '{}')::integer into expiry_minutes
    from public.platform_settings where key = 'request_expiry_minutes';
    new.expires_at := now() + make_interval(mins => coalesce(expiry_minutes, 120));
  end if;
  return new;
end;
$$;

create or replace function public.find_auto_candidates(p_booking_id uuid, p_limit integer default 5)
returns table(pro_id uuid, distance_m double precision, rating_avg numeric)
language sql stable security definer set search_path = public, extensions as $$
  with b as (
    select id, scheduled_start, est_minutes, service_type_id,
      extensions.st_setsrid(extensions.st_makepoint(client_lng, client_lat), 4326)::extensions.geography point
    from public.bookings
    where id = p_booking_id and assignment_mode = 'auto'
      and status = 'requested' and pro_id is null
      and client_lat is not null and client_lng is not null
  )
  select pp.user_id,
    extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(pr.longitude, pr.latitude),4326)::extensions.geography,
      b.point
    ),
    pp.rating_avg
  from b
  join public.pro_profiles pp on pp.active
  join public.pro_presence pr on pr.pro_id = pp.user_id
  where pp.verification_status = 'approved'
    and pp.accepts_auto_assign
    and pp.equipment_policy_accepted_at is not null
    and pp.service_area_latitude is not null
    and pr.is_online and pr.last_seen_at >= now() - interval '90 seconds'
    and exists (select 1 from public.pro_services ps
      where ps.pro_id = pp.user_id and ps.service_type_id = b.service_type_id and ps.active)
    and extensions.st_dwithin(
      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography,
      b.point, pp.service_area_radius_m)
    and exists (select 1 from public.pro_availability av
      where av.pro_id = pp.user_id
        and av.weekday = extract(isodow from (b.scheduled_start at time zone 'America/Santo_Domingo'))::smallint
        and av.start_time <= (b.scheduled_start at time zone 'America/Santo_Domingo')::time
        and av.end_time >= ((b.scheduled_start + make_interval(mins => b.est_minutes)) at time zone 'America/Santo_Domingo')::time)
    and not exists (select 1 from public.bookings ob
      where ob.pro_id = pp.user_id
        and ob.status in ('awaiting_payment','scheduled','en_route','arrived','in_progress')
        and tstzrange(ob.scheduled_start - interval '60 minutes',
          ob.scheduled_start + make_interval(mins => ob.est_minutes) + interval '60 minutes','[)')
        && tstzrange(b.scheduled_start,b.scheduled_start + make_interval(mins => b.est_minutes),'[)'))
    and not exists (select 1 from public.booking_requests old
      where old.booking_id = b.id and old.pro_id = pp.user_id)
    and not exists (select 1 from public.booking_requests pending
      join public.bookings ob on ob.id = pending.booking_id
      where pending.pro_id = pp.user_id and pending.status = 'pending'
        and pending.expires_at > now() and ob.id <> b.id)
  order by 2, pp.rating_avg desc, pp.jobs_completed desc
  limit greatest(1, least(coalesce(p_limit,5),20));
$$;
revoke all on function public.find_auto_candidates(uuid,integer) from public, anon, authenticated;
grant execute on function public.find_auto_candidates(uuid,integer) to service_role;

create or replace function public.process_scheduled_booking_dispatch()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare
  b record;
  candidate_pro_id uuid;
  lead_minutes integer;
  dispatched integer := 0;
begin
  update public.booking_requests set status = 'expired', responded_at = coalesce(responded_at,now())
  where status = 'pending' and expires_at <= now();

  for b in
    select bk.id, bk.scheduled_start, near.distance_m
    from public.bookings bk
    left join lateral (select c.distance_m from public.find_auto_candidates(bk.id,1) c limit 1) near on true
    where bk.assignment_mode = 'auto' and bk.status = 'requested' and bk.pro_id is null
      and not exists (select 1 from public.booking_requests r
        where r.booking_id = bk.id and r.status = 'pending' and r.expires_at > now())
    order by bk.scheduled_start
    limit 100
  loop
    -- Approx. 21 km/h travel speed plus 12 minutes for acceptance/preparation.
    -- If no eligible pro is online yet, start looking one hour before the slot.
    lead_minutes := case when b.distance_m is null then 60
      else greatest(15, ceil(b.distance_m / 350.0)::integer + 12) end;

    if b.scheduled_start <= now() + make_interval(mins => lead_minutes) then
      candidate_pro_id := null;
      select c.pro_id into candidate_pro_id
      from public.find_auto_candidates(b.id,1) c limit 1;

      if candidate_pro_id is not null then
        insert into public.booking_requests(booking_id,pro_id,expires_at)
        values (b.id,candidate_pro_id,now() + interval '45 seconds')
        on conflict (booking_id,pro_id) do nothing;
        if found then dispatched := dispatched + 1; end if;
      elsif b.scheduled_start <= now() - interval '10 minutes' then
        update public.bookings set status = 'expired'
        where id = b.id and status = 'requested' and pro_id is null;
      end if;
    end if;
  end loop;
  return dispatched;
end;
$$;
revoke all on function public.process_scheduled_booking_dispatch() from public, anon, authenticated;
grant execute on function public.process_scheduled_booking_dispatch() to service_role;

-- When Supabase Cron is enabled, run this worker every minute.
do $$
begin
  if to_regnamespace('cron') is not null
     and to_regprocedure('cron.schedule(text,text,text)') is not null then
    if exists (select 1 from cron.job where jobname = 'klipp-scheduled-booking-dispatch') then
      perform cron.unschedule(jobid) from cron.job where jobname = 'klipp-scheduled-booking-dispatch';
    end if;
    perform cron.schedule('klipp-scheduled-booking-dispatch','* * * * *',
      'select public.process_scheduled_booking_dispatch();');
  else
    raise notice 'Enable pg_cron in Supabase, then schedule process_scheduled_booking_dispatch every minute.';
  end if;
end;
$$;

-- Publish incoming offers so the professional app can react without manual refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'booking_requests'
     ) then
    alter publication supabase_realtime add table public.booking_requests;
  end if;
end;
$$;
