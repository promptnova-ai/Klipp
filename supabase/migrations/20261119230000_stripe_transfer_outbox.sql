-- Durable outbox for settlement after the customer confirms service completion.
create table if not exists public.stripe_transfer_outbox (
  booking_id uuid primary key references public.bookings(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued','processing','paid','failed')),
  attempts integer not null default 0 check (attempts>=0),
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz
);
create index if not exists stripe_transfer_outbox_pending_idx
  on public.stripe_transfer_outbox(status,updated_at) where status in ('queued','failed');
alter table public.stripe_transfer_outbox enable row level security;
revoke all on public.stripe_transfer_outbox from public,anon,authenticated;
grant all on public.stripe_transfer_outbox to service_role;

create or replace function public.enqueue_stripe_transfer_after_confirmation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status='confirmed' and old.status is distinct from 'confirmed' then
    insert into public.stripe_transfer_outbox(booking_id,status,attempts)
    values(new.id,'queued',0)
    on conflict(booking_id) do update set
      status=case when public.stripe_transfer_outbox.status='paid' then 'paid' else 'queued' end,
      last_error=null,updated_at=clock_timestamp();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_enqueue_stripe_transfer_after_confirmation on public.bookings;
create trigger trg_enqueue_stripe_transfer_after_confirmation
after update of status on public.bookings
for each row execute function public.enqueue_stripe_transfer_after_confirmation();
revoke all on function public.enqueue_stripe_transfer_after_confirmation() from public,anon,authenticated;

insert into public.stripe_transfer_outbox(booking_id,status)
select b.id,'queued' from public.bookings b
where b.status='confirmed'
on conflict(booking_id) do nothing;

create or replace function public.prepare_stripe_transfer(p_booking_id uuid)
returns table(transfer_row_id uuid,payment_intent_id text,stripe_account_id text,
  amount_minor bigint,currency_code text,transfer_group text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_account public.stripe_connected_accounts%rowtype;
  v_transfer public.stripe_transfers%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found or v_booking.status<>'confirmed' or v_booking.pro_id is null then
    raise exception 'booking must be confirmed by the customer before settlement';
  end if;
  select * into v_payment from public.payments where booking_id=p_booking_id
    and provider='stripe' and status in ('held','released') order by created_at desc limit 1 for update;
  if not found or v_payment.provider_ref is null then raise exception 'captured Stripe payment not found'; end if;
  select * into v_transfer from public.stripe_transfers where booking_id=p_booking_id for update;
  if found and v_transfer.status='paid' then
    return query select v_transfer.id,v_payment.provider_ref,v_transfer.stripe_account_id,
      v_transfer.amount_minor,v_transfer.currency_code,v_transfer.transfer_group;
    return;
  end if;
  if v_payment.refunded_amount_minor>0 then raise exception 'refunded booking requires manual settlement review'; end if;
  select * into v_account from public.stripe_connected_accounts where pro_id=v_booking.pro_id for update;
  if not found or not v_account.payouts_enabled or not v_account.details_submitted
    or v_account.transfers_capability <> 'active' then
    raise exception 'professional Stripe account is not payout eligible';
  end if;

  insert into public.stripe_transfer_outbox(booking_id,status,attempts)
    values(p_booking_id,'processing',1)
    on conflict(booking_id) do update set status='processing',
      attempts=public.stripe_transfer_outbox.attempts+1,last_error=null,updated_at=clock_timestamp();

  insert into public.stripe_transfers(
    booking_id,payment_id,pro_id,stripe_account_id,amount_minor,currency_code,transfer_group,status
  ) values (
    p_booking_id,v_payment.id,v_booking.pro_id,v_account.stripe_account_id,
    round(v_booking.pro_payout_dop*100)::bigint,v_payment.currency_code,'klipp_booking_'||p_booking_id::text,'queued'
  ) on conflict(booking_id) do update set
    status=case when public.stripe_transfers.status='failed' then 'queued' else public.stripe_transfers.status end,
    failure_code=case when public.stripe_transfers.status='failed' then null else public.stripe_transfers.failure_code end,
    failure_message=case when public.stripe_transfers.status='failed' then null else public.stripe_transfers.failure_message end,
    updated_at=clock_timestamp()
  returning * into v_transfer;

  return query select v_transfer.id,v_payment.provider_ref,v_transfer.stripe_account_id,
    v_transfer.amount_minor,v_transfer.currency_code,v_transfer.transfer_group;
end;
$$;

create or replace function public.sync_stripe_transfer_outbox()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status='paid' then
    update public.stripe_transfer_outbox set status='paid',last_error=null,
      completed_at=coalesce(completed_at,clock_timestamp()),updated_at=clock_timestamp()
    where booking_id=new.booking_id;
  elsif new.status='failed' then
    update public.stripe_transfer_outbox set status='failed',
      last_error=left(coalesce(new.failure_message,new.failure_code,'Transfer failed'),500),
      updated_at=clock_timestamp() where booking_id=new.booking_id and status<>'paid';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sync_stripe_transfer_outbox on public.stripe_transfers;
create trigger trg_sync_stripe_transfer_outbox
after update of status on public.stripe_transfers
for each row execute function public.sync_stripe_transfer_outbox();
revoke all on function public.sync_stripe_transfer_outbox() from public,anon,authenticated;
revoke all on function public.prepare_stripe_transfer(uuid) from public,anon,authenticated;
grant execute on function public.prepare_stripe_transfer(uuid) to service_role;
