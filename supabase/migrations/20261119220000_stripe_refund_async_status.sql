drop function if exists public.complete_stripe_refund(uuid,text,text,text,text,boolean);
-- Correctly model asynchronous Stripe refund states and webhook reconciliation.
create or replace function public.complete_stripe_refund(
  p_refund_id uuid,p_stripe_refund_id text,p_transfer_reversal_id text,
  p_failure_code text,p_failure_message text,p_reversal_pending boolean default false,
  p_refund_status text default 'succeeded'
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_refund public.stripe_refund_requests%rowtype;
  v_transfer public.stripe_transfers%rowtype;
  v_new_status text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  select * into v_refund from public.stripe_refund_requests where id=p_refund_id for update;
  if not found then raise exception 'refund request not found'; end if;

  v_new_status:=case
    when p_stripe_refund_id is null then 'failed'
    when p_refund_status='succeeded' then 'succeeded'
    when p_refund_status in ('pending','requires_action') then 'processing'
    else 'failed' end;

  -- A webhook can win the race against the synchronous API response. Never
  -- downgrade a succeeded refund, but still accept its transfer reversal ID.
  if v_refund.status='succeeded' then
    if p_transfer_reversal_id is not null and v_refund.stripe_transfer_reversal_id is null and v_refund.transfer_reversal_amount_minor>0 then
      update public.stripe_refund_requests set stripe_transfer_reversal_id=p_transfer_reversal_id,
        transfer_reversal_pending=false,transfer_reversal_amount_minor=greatest(transfer_reversal_amount_minor,0),
        failure_message=null,updated_at=clock_timestamp() where id=p_refund_id;
      insert into public.stripe_marketplace_ledger(
        booking_id,payment_id,refund_request_id,entry_type,amount_minor,currency_code,
        external_reference,idempotency_key
      ) values (v_refund.booking_id,v_refund.payment_id,v_refund.id,'professional_transfer_reversal',
        -v_refund.transfer_reversal_amount_minor,v_refund.currency_code,p_transfer_reversal_id,
        'transfer-reversal:'||v_refund.id::text)
      on conflict(idempotency_key) do nothing;
    elsif p_reversal_pending then
      update public.stripe_refund_requests set transfer_reversal_pending=true,
        failure_message=left(coalesce(p_failure_message,'Transfer reversal requires reconciliation'),500),
        updated_at=clock_timestamp() where id=p_refund_id;
    end if;
    return;
  end if;

  if v_new_status='processing' then
    update public.stripe_refund_requests set status='processing',stripe_refund_id=p_stripe_refund_id,
      failure_code=null,failure_message=null,updated_at=clock_timestamp() where id=p_refund_id;
    return;
  elsif v_new_status='failed' then
    update public.stripe_refund_requests set status='failed',stripe_refund_id=p_stripe_refund_id,
      failure_code=p_failure_code,failure_message=left(coalesce(p_failure_message,'Stripe refund did not succeed'),500),
      updated_at=clock_timestamp() where id=p_refund_id;
    return;
  end if;

  update public.stripe_refund_requests set status='succeeded',stripe_refund_id=p_stripe_refund_id,
    stripe_transfer_reversal_id=p_transfer_reversal_id,
    transfer_reversal_pending=case when p_transfer_reversal_id is not null then false
      else coalesce(p_reversal_pending,false) end,
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
  elsif coalesce(p_reversal_pending,false) then
    update public.stripe_refund_requests set transfer_reversal_pending=true where id=p_refund_id;
  end if;
end;
$$;

create or replace function public.sync_stripe_refund_status(
  p_refund_request_id uuid,p_stripe_refund_id text,p_status text,p_failure_reason text
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_refund public.stripe_refund_requests%rowtype;
  v_transfer public.stripe_transfers%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  select * into v_refund from public.stripe_refund_requests where id=p_refund_request_id for update;
  if not found then return 'unmatched'; end if;
  if v_refund.stripe_refund_id is not null and v_refund.stripe_refund_id<>p_stripe_refund_id then
    raise exception 'Stripe refund ID mismatch';
  end if;
  if v_refund.status='succeeded' then return 'already_succeeded'; end if;

  if p_status='succeeded' then
    select * into v_transfer from public.stripe_transfers where booking_id=v_refund.booking_id;
    update public.stripe_refund_requests set status='succeeded',stripe_refund_id=p_stripe_refund_id,
      transfer_reversal_pending=(found and v_transfer.stripe_transfer_id is not null
        and v_refund.transfer_reversal_amount_minor>0),
      failure_code=null,failure_message=null,updated_at=clock_timestamp() where id=v_refund.id;
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
  elsif p_status in ('pending','requires_action') then
    update public.stripe_refund_requests set status='processing',stripe_refund_id=p_stripe_refund_id,
      updated_at=clock_timestamp() where id=v_refund.id;
  elsif p_status in ('failed','canceled','cancelled') then
    update public.stripe_refund_requests set status='failed',stripe_refund_id=p_stripe_refund_id,
      failure_code='stripe_refund_'||p_status,failure_message=left(coalesce(p_failure_reason,p_status),500),
      updated_at=clock_timestamp() where id=v_refund.id;
  else
    return 'ignored_status';
  end if;
  return 'synchronized';
end;
$$;

revoke all on function public.complete_stripe_refund(uuid,text,text,text,text,boolean,text) from public,anon,authenticated;
revoke all on function public.sync_stripe_refund_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_stripe_refund(uuid,text,text,text,text,boolean,text) to service_role;
grant execute on function public.sync_stripe_refund_status(uuid,text,text,text) to service_role;
