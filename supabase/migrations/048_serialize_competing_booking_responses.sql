-- Serialize accept/reject responses for a booking before locking an
-- individual offer row. This prevents deadlocks when one pro accepts while
-- another pro rejects and the winner expires all competing offers.
create or replace function public.respond_to_request(
  p_request_id uuid,
  p_accept boolean,
  p_materials_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_booking_id uuid;
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
    and expires_at > now();

  if v_booking_id is null then
    raise exception 'request not found or expired';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('klipp_auto_dispatch'),
    hashtext(v_booking_id::text)
  );

  if p_accept then
    if coalesce(p_materials_confirmed, false) is not true then
      raise exception 'materials confirmation required';
    end if;

    update public.booking_requests
    set materials_confirmed_at = now()
    where id = p_request_id
      and pro_id = auth.uid()
      and status = 'pending'
      and expires_at > now();

    if not found then
      raise exception 'request not found or expired';
    end if;
  end if;

  perform public.respond_to_request_unchecked(p_request_id, p_accept);
end;
$function$;

revoke all on function public.respond_to_request(uuid, boolean, boolean) from public, anon;
grant execute on function public.respond_to_request(uuid, boolean, boolean) to authenticated;
