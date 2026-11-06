-- Auto-dispatch offers must retain the short acceptance window.
-- Manual professional requests continue to use the configurable platform setting.
create or replace function public.apply_booking_request_expiry()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  expiry_minutes integer;
  v_assignment_mode public.assignment_mode;
begin
  select assignment_mode
  into v_assignment_mode
  from public.bookings
  where id = new.booking_id;

  if v_assignment_mode = 'auto' then
    new.expires_at := now() + interval '45 seconds';
  else
    select (value #>> '{}')::integer
    into expiry_minutes
    from public.platform_settings
    where key = 'request_expiry_minutes';

    new.expires_at := now() + make_interval(mins => coalesce(expiry_minutes, 120));
  end if;

  return new;
end;
$function$;
