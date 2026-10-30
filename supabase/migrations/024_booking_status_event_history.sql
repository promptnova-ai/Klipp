-- Immutable status history for every Klipp booking.
create table if not exists public.booking_status_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists booking_status_events_booking_time_idx
  on public.booking_status_events (booking_id, occurred_at, id);

alter table public.booking_status_events enable row level security;

drop policy if exists booking_status_events_participants_read
  on public.booking_status_events;
create policy booking_status_events_participants_read
  on public.booking_status_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.id = booking_status_events.booking_id
        and (b.client_id = (select auth.uid()) or b.pro_id = (select auth.uid()))
    )
  );

grant select on public.booking_status_events to authenticated;

create or replace function public.record_booking_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_status_events (
      booking_id, from_status, to_status, actor_id, occurred_at
    ) values (
      new.id, null, new.status, auth.uid(), coalesce(new.created_at, now())
    );
  elsif new.status is distinct from old.status then
    insert into public.booking_status_events (
      booking_id, from_status, to_status, actor_id, occurred_at
    ) values (
      new.id, old.status, new.status, auth.uid(), now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_record_status_event on public.bookings;
create trigger bookings_record_status_event
  after insert or update of status on public.bookings
  for each row execute function public.record_booking_status_event();

alter table public.booking_status_events replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'booking_status_events'
  ) then
    alter publication supabase_realtime add table public.booking_status_events;
  end if;
end;
$$;
