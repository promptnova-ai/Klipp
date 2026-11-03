-- Klipp: equipment policy and removal of massage services.
-- Existing service rows are retained for historical bookings; only future discovery is disabled.

update public.service_categories
set active = false
where code = 'masajes-bienestar';

update public.service_types
set active = false
where code = 'masajes';

update public.pro_services ps
set active = false
from public.service_types st
where st.id = ps.service_type_id
  and st.code = 'masajes';

alter table public.pro_profiles
  add column if not exists equipment_policy_accepted_at timestamptz;

create or replace function public.confirm_pro_equipment_policy()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accepted_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.pro_profiles
    where user_id = auth.uid()
  ) then
    raise exception 'professional profile not found';
  end if;

  update public.pro_profiles
  set equipment_policy_accepted_at = now()
  where user_id = auth.uid()
  returning equipment_policy_accepted_at into v_accepted_at;

  return v_accepted_at;
end;
$$;

revoke all on function public.confirm_pro_equipment_policy() from public, anon;
grant execute on function public.confirm_pro_equipment_policy() to authenticated;

create or replace function public.enforce_pro_equipment_policy_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pro_id is not null then
    if tg_op = 'INSERT' or old.pro_id is distinct from new.pro_id then
      if not exists (
        select 1 from public.pro_profiles pp
        where pp.user_id = new.pro_id
          and pp.equipment_policy_accepted_at is not null
      ) then
        raise exception 'professional must confirm the Klipp equipment policy before accepting bookings';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_pro_equipment_policy_on_booking on public.bookings;
create trigger trg_enforce_pro_equipment_policy_on_booking
before insert or update of pro_id on public.bookings
for each row execute function public.enforce_pro_equipment_policy_on_booking();

create or replace function public.find_auto_candidates(p_booking_id uuid, p_limit int default 5)
returns table (pro_id uuid, distance_m double precision, rating_avg numeric)
language sql stable security definer set search_path = public, extensions as $$
  with b as (
    select bk.id, bk.scheduled_start, bk.est_minutes, a.sector_id, a.location
    from public.bookings bk
    join public.addresses a on a.id = bk.address_id
    where bk.id = p_booking_id
  )
  select p.user_id,
         st_distance(b.location, s.center) as distance_m,
         p.rating_avg
  from b
  join public.pro_sectors ps on ps.sector_id = b.sector_id
  join public.pro_profiles p on p.user_id = ps.pro_id
  join public.sectors s on s.id = p.base_sector_id
  where p.verification_status = 'approved'
    and p.active
    and p.accepts_auto_assign
    and p.equipment_policy_accepted_at is not null
    and exists (
      select 1 from public.pro_availability av
      where av.pro_id = p.user_id
        and av.weekday = extract(isodow from (b.scheduled_start at time zone 'America/Santo_Domingo'))::int
        and av.start_time <= (b.scheduled_start at time zone 'America/Santo_Domingo')::time
        and av.end_time >= ((b.scheduled_start + make_interval(mins => b.est_minutes)) at time zone 'America/Santo_Domingo')::time
    )
    and not exists (
      select 1 from public.bookings o
      where o.pro_id = p.user_id
        and o.status in ('scheduled', 'en_route', 'arrived', 'in_progress')
        and tstzrange(
          o.scheduled_start - interval '60 minutes',
          o.scheduled_start + make_interval(mins => o.est_minutes) + interval '60 minutes'
        ) && tstzrange(b.scheduled_start, b.scheduled_start + make_interval(mins => b.est_minutes))
    )
    and not exists (
      select 1 from public.booking_requests r
      where r.booking_id = b.id and r.pro_id = p.user_id
    )
  order by distance_m asc, p.rating_avg desc
  limit p_limit;
$$;

revoke execute on function public.find_auto_candidates(uuid, int) from public, anon, authenticated;
grant execute on function public.find_auto_candidates(uuid, int) to service_role;

create or replace function public.enforce_active_service_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active and not exists (
    select 1 from public.service_types st
    where st.id = new.service_type_id and st.active
  ) then
    raise exception 'cannot activate a professional offer for an inactive catalog service';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_active_service_catalog on public.pro_services;
create trigger trg_enforce_active_service_catalog
before insert or update of active, service_type_id on public.pro_services
for each row execute function public.enforce_active_service_catalog();
