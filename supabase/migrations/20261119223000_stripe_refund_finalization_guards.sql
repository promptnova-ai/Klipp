-- Keep transfer aggregate status synchronized and prevent retrying a terminal Stripe refund ID.
create or replace function public.sync_stripe_transfer_reversal_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_transfer public.stripe_transfers%rowtype; v_reversed bigint;
begin
  if new.status='succeeded' and new.stripe_transfer_reversal_id is not null
    and (old.stripe_transfer_reversal_id is distinct from new.stripe_transfer_reversal_id) then
    select * into v_transfer from public.stripe_transfers where booking_id=new.booking_id for update;
    if found then
      select coalesce(sum(r.transfer_reversal_amount_minor),0) into v_reversed
      from public.stripe_refund_requests r
      where r.payment_id=new.payment_id and r.status='succeeded'
        and r.stripe_transfer_reversal_id is not null;
      update public.stripe_transfers set status=case
        when v_reversed>=amount_minor then 'reversed' else 'partially_reversed' end,
        updated_at=clock_timestamp() where id=v_transfer.id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sync_stripe_transfer_reversal_status on public.stripe_refund_requests;
create trigger trg_sync_stripe_transfer_reversal_status
after update of stripe_transfer_reversal_id on public.stripe_refund_requests
for each row execute function public.sync_stripe_transfer_reversal_status();
revoke all on function public.sync_stripe_transfer_reversal_status() from public,anon,authenticated;

create or replace function public.prepare_stripe_refund(p_refund_request_id uuid)
returns table(refund_id uuid,payment_intent_id text,amount_minor bigint,currency_code text,
  transfer_id text,transfer_reversal_amount_minor bigint,booking_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_refund public.stripe_refund_requests%rowtype;
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_transfer public.stripe_transfers%rowtype;
  v_prior_refunded bigint := 0;
  v_prior_reversed bigint := 0;
  v_reversal_delta bigint := 0;
begin
  if auth.uid() is null or not public.has_admin_permission('finance.reconcile') then
    raise exception 'finance permission required';
  end if;
  select * into v_refund from public.stripe_refund_requests where id=p_refund_request_id for update;
  if not found then raise exception 'refund request not found'; end if;
  if v_refund.status='succeeded' then raise exception 'refund already completed'; end if;
  if v_refund.status='failed' and v_refund.stripe_refund_id is not null then
    raise exception 'Stripe refund failed terminally; create a new refund request';
  end if;
  if v_refund.status not in ('requested','failed','processing') then raise exception 'refund is not processable'; end if;

  select * into v_payment from public.payments where id=v_refund.payment_id for update;
  select * into v_booking from public.bookings where id=v_refund.booking_id;
  select * into v_transfer from public.stripe_transfers where booking_id=v_refund.booking_id;
  if v_payment.provider_ref is null then raise exception 'payment has no Stripe PaymentIntent'; end if;

  if v_transfer.stripe_transfer_id is not null then
    if exists(select 1 from public.stripe_refund_requests r
      where r.payment_id=v_refund.payment_id and r.id<>v_refund.id
        and r.status='succeeded' and r.transfer_reversal_pending) then
      raise exception 'a previous professional transfer reversal requires reconciliation first';
    end if;
    select coalesce(sum(r.amount_minor),0),coalesce(sum(r.transfer_reversal_amount_minor),0)
      into v_prior_refunded,v_prior_reversed
    from public.stripe_refund_requests r
    where r.payment_id=v_refund.payment_id and r.id<>v_refund.id and r.status='succeeded';
    v_reversal_delta:=greatest(0,
      floor((v_prior_refunded+v_refund.amount_minor)::numeric*v_booking.pro_payout_dop/
        nullif(v_booking.price_dop,0))::bigint-v_prior_reversed);
    if v_reversal_delta>v_transfer.amount_minor-v_prior_reversed then
      raise exception 'professional reversal exceeds unreversed transfer balance';
    end if;
  end if;

  update public.stripe_refund_requests set status='processing',reviewed_by=auth.uid(),
    reviewed_at=coalesce(reviewed_at,clock_timestamp()),
    transfer_reversal_amount_minor=v_reversal_delta,transfer_reversal_pending=false,
    updated_at=clock_timestamp() where id=v_refund.id;

  return query select v_refund.id,v_payment.provider_ref,v_refund.amount_minor,v_refund.currency_code,
    v_transfer.stripe_transfer_id,v_reversal_delta,v_refund.booking_id;
end;
$$;
revoke all on function public.prepare_stripe_refund(uuid) from public,anon;
grant execute on function public.prepare_stripe_refund(uuid) to authenticated;
