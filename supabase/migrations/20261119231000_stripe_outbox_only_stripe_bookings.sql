-- Only enqueue settlements for bookings with an actual Stripe payment.
create or replace function public.enqueue_stripe_transfer_after_confirmation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status='confirmed' and old.status is distinct from 'confirmed'
    and exists(select 1 from public.payments p where p.booking_id=new.id and p.provider='stripe') then
    insert into public.stripe_transfer_outbox(booking_id,status,attempts)
    values(new.id,'queued',0)
    on conflict(booking_id) do update set
      status=case when public.stripe_transfer_outbox.status='paid' then 'paid' else 'queued' end,
      last_error=null,updated_at=clock_timestamp();
  end if;
  return new;
end;
$$;
delete from public.stripe_transfer_outbox o
where not exists(select 1 from public.payments p where p.booking_id=o.booking_id and p.provider='stripe');
insert into public.stripe_transfer_outbox(booking_id,status)
select b.id,'queued' from public.bookings b
where b.status='confirmed' and exists(
  select 1 from public.payments p where p.booking_id=b.id and p.provider='stripe'
)
on conflict(booking_id) do nothing;
