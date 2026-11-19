-- Retryable, cumulative transfer reversals for partial refunds.
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
  if v_refund.status not in ('requested','failed','processing') then raise exception 'refund is already rejected'; end if;

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

create or replace function public.complete_stripe_refund(
  p_refund_id uuid,p_stripe_refund_id text,p_transfer_reversal_id text,
  p_failure_code text,p_failure_message text,p_reversal_pending boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_refund public.stripe_refund_requests%rowtype; v_transfer public.stripe_transfers%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  select * into v_refund from public.stripe_refund_requests where id=p_refund_id for update;
  if not found then raise exception 'refund request not found'; end if;
  if v_refund.status='succeeded' then return; end if;
  if p_stripe_refund_id is not null then
    update public.stripe_refund_requests set status='succeeded',stripe_refund_id=p_stripe_refund_id,
      stripe_transfer_reversal_id=p_transfer_reversal_id,
      transfer_reversal_pending=coalesce(p_reversal_pending,false),
      failure_code=null,
      failure_message=case when coalesce(p_reversal_pending,false)
        then 'Customer refund succeeded; professional transfer reversal requires reconciliation' else null end,
      updated_at=clock_timestamp() where id=p_refund_id;
    update public.payments set refunded_amount_minor=refunded_amount_minor+v_refund.amount_minor,
      status=case when refunded_amount_minor+v_refund.amount_minor>=round(amount_dop*100)::bigint
        then 'refunded'::public.payment_status else status end,
      provider_refund_id=p_stripe_refund_id,refunded_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=v_refund.payment_id;
    insert into public.stripe_marketplace_ledger(
      booking_id,payment_id,refund_request_id,entry_type,amount_minor,currency_code,
      external_reference,idempotency_key
    ) values (v_refund.booking_id,v_refund.payment_id,v_refund.id,'customer_refund',
      -v_refund.amount_minor,v_refund.currency_code,p_stripe_refund_id,'refund:'||v_refund.id::text)
    on conflict(idempotency_key) do nothing;
    if p_transfer_reversal_id is not null and v_refund.transfer_reversal_amount_minor>0 then
      insert into public.stripe_marketplace_ledger(
        booking_id,payment_id,refund_request_id,entry_type,amount_minor,currency_code,
        external_reference,idempotency_key
      ) values (v_refund.booking_id,v_refund.payment_id,v_refund.id,'professional_transfer_reversal',
        -v_refund.transfer_reversal_amount_minor,v_refund.currency_code,p_transfer_reversal_id,
        'transfer-reversal:'||v_refund.id::text)
      on conflict(idempotency_key) do nothing;
      select * into v_transfer from public.stripe_transfers where booking_id=v_refund.booking_id for update;
      if found then
        update public.stripe_transfers set status=case
          when (select coalesce(sum(r.transfer_reversal_amount_minor),0) from public.stripe_refund_requests r
            where r.payment_id=v_refund.payment_id and r.status='succeeded' and r.stripe_transfer_reversal_id is not null)
            >= amount_minor then 'reversed' else 'partially_reversed' end,
          updated_at=clock_timestamp() where id=v_transfer.id;
      end if;
    end if;
  else
    update public.stripe_refund_requests set status='failed',failure_code=p_failure_code,
      failure_message=left(p_failure_message,500),updated_at=clock_timestamp() where id=p_refund_id;
  end if;
end;
$$;

create or replace function public.prepare_stripe_transfer_reversal(p_refund_id uuid)
returns table(refund_id uuid,transfer_id text,amount_minor bigint)
language plpgsql security definer set search_path = ''
as $$
declare v_refund public.stripe_refund_requests%rowtype; v_transfer public.stripe_transfers%rowtype;
begin
  if auth.uid() is null or not public.has_admin_permission('finance.reconcile') then
    raise exception 'finance permission required';
  end if;
  select * into v_refund from public.stripe_refund_requests where id=p_refund_id for update;
  if not found or v_refund.status<>'succeeded' or not v_refund.transfer_reversal_pending then
    raise exception 'refund has no pending transfer reversal';
  end if;
  select * into v_transfer from public.stripe_transfers where booking_id=v_refund.booking_id;
  if not found or v_transfer.stripe_transfer_id is null or v_refund.transfer_reversal_amount_minor<=0 then
    raise exception 'professional transfer cannot be reversed';
  end if;
  return query select v_refund.id,v_transfer.stripe_transfer_id,v_refund.transfer_reversal_amount_minor;
end;
$$;

create or replace function public.complete_stripe_transfer_reversal(
  p_refund_id uuid,p_reversal_id text,p_failure_message text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_refund public.stripe_refund_requests%rowtype; v_transfer public.stripe_transfers%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  select * into v_refund from public.stripe_refund_requests where id=p_refund_id for update;
  if not found then raise exception 'refund request not found'; end if;
  if p_reversal_id is null then
    update public.stripe_refund_requests set transfer_reversal_pending=true,
      failure_message=left(coalesce(p_failure_message,'Transfer reversal pending'),500),
      updated_at=clock_timestamp() where id=p_refund_id;
    return;
  end if;
  if v_refund.stripe_transfer_reversal_id=p_reversal_id and not v_refund.transfer_reversal_pending then return; end if;
  update public.stripe_refund_requests set stripe_transfer_reversal_id=p_reversal_id,
    transfer_reversal_pending=false,failure_message=null,updated_at=clock_timestamp() where id=p_refund_id;
  insert into public.stripe_marketplace_ledger(
    booking_id,payment_id,refund_request_id,entry_type,amount_minor,currency_code,
    external_reference,idempotency_key
  ) values (v_refund.booking_id,v_refund.payment_id,v_refund.id,'professional_transfer_reversal',
    -v_refund.transfer_reversal_amount_minor,v_refund.currency_code,p_reversal_id,
    'transfer-reversal:'||v_refund.id::text)
  on conflict(idempotency_key) do nothing;
  select * into v_transfer from public.stripe_transfers where booking_id=v_refund.booking_id for update;
  if found then
    update public.stripe_transfers set status=case
      when (select coalesce(sum(r.transfer_reversal_amount_minor),0) from public.stripe_refund_requests r
        where r.payment_id=v_refund.payment_id and r.status='succeeded' and r.stripe_transfer_reversal_id is not null)
        >= amount_minor then 'reversed' else 'partially_reversed' end,
      updated_at=clock_timestamp() where id=v_transfer.id;
  end if;
end;
$$;

revoke all on function public.prepare_stripe_transfer_reversal(uuid) from public,anon;
revoke all on function public.complete_stripe_transfer_reversal(uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepare_stripe_transfer_reversal(uuid) to authenticated;
grant execute on function public.complete_stripe_transfer_reversal(uuid,text,text) to service_role;
