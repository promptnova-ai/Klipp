-- Bound billable Google Routes API calls from the client-facing ETA endpoint.
-- A single atomic row per booking enforces a 30-second cooldown across sessions.
create table if not exists public.booking_eta_request_limits (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  last_requested_at timestamptz not null
);

alter table public.booking_eta_request_limits enable row level security;
revoke all on table public.booking_eta_request_limits from public, anon, authenticated;
grant all on table public.booking_eta_request_limits to service_role;

create or replace function public.claim_booking_eta_request(
  p_booking_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claimed boolean;
begin
  if p_booking_id is null or p_user_id is null then
    raise exception 'booking and requesting user are required';
  end if;

  insert into public.booking_eta_request_limits (
    booking_id,
    requested_by,
    last_requested_at
  )
  values (
    p_booking_id,
    p_user_id,
    pg_catalog.clock_timestamp()
  )
  on conflict (booking_id) do update
    set requested_by = excluded.requested_by,
        last_requested_at = excluded.last_requested_at
    where public.booking_eta_request_limits.last_requested_at
      <= pg_catalog.clock_timestamp() - interval '30 seconds'
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$function$;

revoke all on function public.claim_booking_eta_request(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_booking_eta_request(uuid, uuid)
  to service_role;
