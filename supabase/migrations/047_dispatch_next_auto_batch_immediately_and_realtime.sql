-- Start the next nearest batch immediately when all offers in a batch
-- have been rejected or expired. Acceptance locks the booking and expires
-- competing offers, so no further batch is created after a winner exists.
create or replace function public.dispatch_next_auto_booking_round_on_response()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_booking public.bookings%rowtype;
  v_created integer := 0;
begin
  if old.status is not distinct from new.status
     or new.status not in ('rejected'::public.request_status, 'expired'::public.request_status) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('klipp_auto_dispatch'),
    hashtext(new.booking_id::text)
  );

  select * into v_booking
  from public.bookings
  where id = new.booking_id
  for update;

  if not found
     or v_booking.assignment_mode <> 'auto'
     or v_booking.status <> 'requested'
     or v_booking.pro_id is not null then
    return new;
  end if;

  if exists (
    select 1
    from public.booking_requests
    where booking_id = new.booking_id
      and status = 'pending'
      and expires_at > now()
  ) then
    return new;
  end if;

  -- Candidate selection is nearest-first and excludes professionals who
  -- have already received this booking in an earlier round.
  insert into public.booking_requests (booking_id, pro_id, expires_at)
  select new.booking_id, candidate.pro_id, now() + interval '45 seconds'
  from public.find_auto_candidates(new.booking_id, 5) candidate
  on conflict (booking_id, pro_id) do nothing;

  get diagnostics v_created = row_count;
  return new;
end;
$function$;

drop trigger if exists booking_requests_dispatch_next_auto_round on public.booking_requests;
create trigger booking_requests_dispatch_next_auto_round
after update of status on public.booking_requests
for each row
when (old.status is distinct from new.status)
execute function public.dispatch_next_auto_booking_round_on_response();

-- Required for the professional app's postgres_changes subscription. It lets
-- every recipient remove an offer immediately when another professional wins.
alter publication supabase_realtime add table public.booking_requests;
