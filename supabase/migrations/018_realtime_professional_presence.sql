-- Real-time professional presence for immediate, on-demand requests.
-- Scheduled bookings continue to use the existing availability calendar.

create table public.pro_presence (
  pro_id uuid primary key references public.pro_profiles(user_id) on delete cascade,
  is_online boolean not null default false,
  latitude double precision,
  longitude double precision,
  online_since timestamptz,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint pro_presence_coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint pro_presence_latitude check (latitude is null or latitude between -90 and 90),
  constraint pro_presence_longitude check (longitude is null or longitude between -180 and 180),
  constraint pro_presence_online_location check (not is_online or (latitude is not null and longitude is not null and last_seen_at is not null))
);

create index pro_presence_online_fresh_idx
  on public.pro_presence (last_seen_at desc)
  where is_online = true;

alter table public.pro_presence enable row level security;

create policy pro_presence_read_own
  on public.pro_presence for select to authenticated
  using (pro_id = (select auth.uid()));

revoke all on public.pro_presence from anon, authenticated;
grant select on public.pro_presence to authenticated;

create or replace function public.set_pro_presence(
  p_online boolean,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_last_seen timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from public.pro_profiles pp
    where pp.user_id = auth.uid()
      and pp.active
      and pp.verification_status = 'approved'
      and pp.equipment_policy_accepted_at is not null
  ) then
    raise exception 'professional must be approved, active and have accepted the equipment policy';
  end if;

  if p_online then
    if p_latitude is null or p_longitude is null
      or p_latitude not between -90 and 90
      or p_longitude not between -180 and 180 then
      raise exception 'valid location is required to go online';
    end if;

    insert into public.pro_presence (pro_id, is_online, latitude, longitude, online_since, last_seen_at, updated_at)
    values (auth.uid(), true, p_latitude, p_longitude, v_now, v_now, v_now)
    on conflict (pro_id) do update
      set is_online = true,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          online_since = case when public.pro_presence.is_online then public.pro_presence.online_since else v_now end,
          last_seen_at = v_now,
          updated_at = v_now
    returning last_seen_at into v_last_seen;
  else
    insert into public.pro_presence (pro_id, is_online, latitude, longitude, online_since, last_seen_at, updated_at)
    values (auth.uid(), false, null, null, null, null, v_now)
    on conflict (pro_id) do update
      set is_online = false,
          latitude = null,
          longitude = null,
          online_since = null,
          last_seen_at = null,
          updated_at = v_now
    returning updated_at into v_last_seen;
  end if;

  return v_last_seen;
end;
$$;

create or replace function public.heartbeat_pro_presence(
  p_latitude double precision,
  p_longitude double precision
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid location';
  end if;

  update public.pro_presence
  set latitude = p_latitude,
      longitude = p_longitude,
      last_seen_at = v_now,
      updated_at = v_now
  where pro_id = auth.uid()
    and is_online = true;

  if not found then raise exception 'professional is offline'; end if;
  return v_now;
end;
$$;

revoke all on function public.set_pro_presence(boolean, double precision, double precision) from public, anon;
grant execute on function public.set_pro_presence(boolean, double precision, double precision) to authenticated;
revoke all on function public.heartbeat_pro_presence(double precision, double precision) from public, anon;
grant execute on function public.heartbeat_pro_presence(double precision, double precision) to authenticated;

-- Presence is considered live only for 90 seconds. Consumers must use this predicate
-- so a closed app or lost connection cannot leave a professional discoverable forever.
create or replace function public.is_pro_really_online(p_pro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pro_presence pp
    join public.pro_profiles profile on profile.user_id = pp.pro_id
    where pp.pro_id = p_pro_id
      and pp.is_online
      and pp.last_seen_at >= now() - interval '90 seconds'
      and profile.active
      and profile.verification_status = 'approved'
      and profile.equipment_policy_accepted_at is not null
  );
$$;

revoke all on function public.is_pro_really_online(uuid) from public, anon, authenticated;
