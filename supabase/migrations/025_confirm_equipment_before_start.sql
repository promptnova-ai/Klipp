-- Record the per-booking equipment confirmation and block service start without it.
alter table public.bookings
  add column if not exists equipment_confirmed_at timestamptz,
  add column if not exists equipment_confirmed_by uuid references auth.users(id);

create or replace function public.advance_booking(p_booking_id uuid, p_new_status booking_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.bookings%rowtype;
begin
  select * into v from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'booking not found'; end if;

  if auth.uid() = v.pro_id then
    if not (
      (v.status = 'scheduled' and p_new_status = 'en_route') or
      (v.status = 'en_route' and p_new_status = 'arrived') or
      (v.status = 'arrived' and p_new_status = 'in_progress') or
      (v.status = 'in_progress' and p_new_status = 'completed')
    ) then raise exception 'invalid transition'; end if;

    if p_new_status = 'in_progress'
       and (v.equipment_confirmed_at is null or v.equipment_confirmed_by is distinct from auth.uid()) then
      raise exception 'equipment confirmation required';
    end if;
  elsif auth.uid() = v.client_id then
    if not (v.status = 'completed' and p_new_status = 'confirmed') then
      raise exception 'invalid transition';
    end if;
  else
    raise exception 'not allowed';
  end if;

  update public.bookings set
    status = p_new_status,
    en_route_at = case when p_new_status = 'en_route' then now() else en_route_at end,
    arrived_at = case when p_new_status = 'arrived' then now() else arrived_at end,
    started_at = case when p_new_status = 'in_progress' then now() else started_at end,
    completed_at = case when p_new_status = 'completed' then now() else completed_at end,
    confirmed_at = case when p_new_status = 'confirmed' then now() else confirmed_at end
  where id = p_booking_id;
end;
$$;

create or replace function public.confirm_booking_equipment_and_start(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.bookings%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then raise exception 'booking not found'; end if;
  if v.pro_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if v.status <> 'arrived' then raise exception 'booking must be marked as arrived first'; end if;

  if not exists (
    select 1 from public.pro_profiles pp
    where pp.user_id = auth.uid()
      and pp.active
      and pp.verification_status = 'approved'
      and pp.equipment_policy_accepted_at is not null
  ) then
    raise exception 'professional equipment policy must be accepted';
  end if;

  update public.bookings
     set equipment_confirmed_at = now(),
         equipment_confirmed_by = auth.uid()
   where id = p_booking_id;

  perform public.advance_booking(p_booking_id, 'in_progress'::public.booking_status);
end;
$$;

revoke all on function public.confirm_booking_equipment_and_start(uuid) from public, anon;
grant execute on function public.confirm_booking_equipment_and_start(uuid) to authenticated;
