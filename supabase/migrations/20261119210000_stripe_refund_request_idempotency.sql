-- Make refund request creation replay-safe and keep Connect country server-controlled.
create or replace function public.request_stripe_refund(
  p_booking_id uuid,p_amount_minor bigint,p_reason text,p_note text,p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_existing public.stripe_refund_requests%rowtype;
  v_refund_id uuid;
  v_total_minor bigint;
  v_remaining bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_booking_id is null or p_amount_minor is null or p_amount_minor<=0
    or p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128
    or p_reason not in ('duplicate','fraudulent','requested_by_customer','service_not_provided','service_issue','other')
    or length(coalesce(p_note,''))>1000 then raise exception 'invalid refund request'; end if;

  select * into v_existing from public.stripe_refund_requests
    where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.booking_id<>p_booking_id or v_existing.requested_by<>auth.uid()
      or v_existing.amount_minor<>p_amount_minor or v_existing.reason<>p_reason then
      raise exception 'idempotency key belongs to a different refund request';
    end if;
    return v_existing.id;
  end if;

  select * into v_booking from public.bookings
    where id=p_booking_id and client_id=auth.uid() for update;
  if not found then raise exception 'booking not found'; end if;
  select * into v_payment from public.payments
    where booking_id=p_booking_id and provider='stripe'
      and status in ('held','released','refunded')
    order by created_at desc limit 1 for update;
  if not found then raise exception 'no refundable Stripe payment'; end if;

  v_total_minor:=round(v_payment.amount_dop*100)::bigint;
  v_remaining:=v_total_minor-v_payment.refunded_amount_minor
    - coalesce((select sum(r.amount_minor) from public.stripe_refund_requests r
      where r.payment_id=v_payment.id and r.status in ('requested','processing')),0);
  if p_amount_minor>v_remaining then raise exception 'refund amount exceeds remaining refundable balance'; end if;

  insert into public.stripe_refund_requests(
    booking_id,payment_id,requested_by,idempotency_key,amount_minor,currency_code,reason,customer_note
  ) values (
    p_booking_id,v_payment.id,auth.uid(),p_idempotency_key,p_amount_minor,v_payment.currency_code,
    p_reason,nullif(trim(p_note),'')
  ) returning id into v_refund_id;
  return v_refund_id;
end;
$$;
