-- Allow a professional device to mark its own offer expired as soon as the
-- 45-second countdown reaches zero. The trigger installed by migration 047
-- advances the automatic-dispatch queue when the final live offer expires.
create or replace function public.pro_expire_booking_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

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
