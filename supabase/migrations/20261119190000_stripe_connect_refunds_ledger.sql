-- Stripe Connect marketplace settlement, refund workflow and auditable ledger.
-- QA-first: all money-moving operations are server-side and idempotent.

create table if not exists public.stripe_connected_accounts (
  pro_id uuid primary key references public.pro_profiles(user_id) on delete restrict,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  country_code char(2) not null,
  account_type text not null default 'express' check (account_type in ('express','standard','custom')),
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  transfers_capability text,
  requirements_currently_due jsonb not null default '[]'::jsonb,
  requirements_past_due jsonb not null default '[]'::jsonb,
  disabled_reason text,
  onboarding_completed_at timestamptz,
  last_synced_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.stripe_transfers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  pro_id uuid not null references public.pro_profiles(user_id) on delete restrict,
  stripe_account_id text not null,
  stripe_transfer_id text unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null,
  transfer_group text not null unique,
  status text not null default 'queued' check (status in ('queued','processing','paid','failed','reversed','partially_reversed')),
  failure_code text,
  failure_message text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  paid_at timestamptz
);

create table if not exists public.stripe_refund_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null unique,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null,
  reason text not null check (reason in ('duplicate','fraudulent','requested_by_customer','service_not_provided','service_issue','other')),
  customer_note text,
  status text not null default 'requested' check (status in ('requested','processing','succeeded','failed','rejected')),
  stripe_refund_id text unique,
  stripe_transfer_reversal_id text unique,
  transfer_reversal_amount_minor bigint not null default 0 check (transfer_reversal_amount_minor >= 0),
  transfer_reversal_pending boolean not null default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.stripe_connect_webhook_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text not null,
  object_id text,
  processed_at timestamptz,
  last_error text,
  received_at timestamptz not null default clock_timestamp()
);

create table if not exists public.stripe_disputes (
  stripe_dispute_id text primary key,
  stripe_charge_id text not null,
  payment_intent_id text,
  booking_id uuid references public.bookings(id) on delete restrict,
  amount_minor bigint not null,
  currency_code text not null,
  status text not null,
  reason text,
  evidence_due_at timestamptz,
  closed_at timestamptz,
  raw_status_updated_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.stripe_marketplace_ledger (
  id bigint generated always as identity primary key,
  booking_id uuid references public.bookings(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  refund_request_id uuid references public.stripe_refund_requests(id) on delete restrict,
  transfer_id uuid references public.stripe_transfers(id) on delete restrict,
  entry_type text not null check (entry_type in ('customer_charge','platform_fee','professional_payable','professional_transfer','customer_refund','professional_transfer_reversal','dispute_debit','dispute_credit')),
  amount_minor bigint not null check (amount_minor <> 0),
  currency_code text not null,
  external_reference text,
  idempotency_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists stripe_refund_requests_booking_idx on public.stripe_refund_requests(booking_id, created_at desc);
create index if not exists stripe_transfers_status_idx on public.stripe_transfers(status, created_at);
create index if not exists stripe_disputes_booking_idx on public.stripe_disputes(booking_id, status);

alter table public.payments add column if not exists refunded_amount_minor bigint not null default 0 check (refunded_amount_minor >= 0);
alter table public.payments add column if not exists stripe_latest_charge_id text;
alter table public.payments add column if not exists stripe_transfer_group text;

alter table public.stripe_connected_accounts enable row level security;
alter table public.stripe_transfers enable row level security;
alter table public.stripe_refund_requests enable row level security;
alter table public.stripe_connect_webhook_events enable row level security;
alter table public.stripe_disputes enable row level security;
alter table public.stripe_marketplace_ledger enable row level security;

revoke all on public.stripe_connected_accounts, public.stripe_transfers, public.stripe_refund_requests,
  public.stripe_connect_webhook_events, public.stripe_disputes, public.stripe_marketplace_ledger
from public, anon, authenticated;
grant all on public.stripe_connected_accounts, public.stripe_transfers, public.stripe_refund_requests,
  public.stripe_connect_webhook_events, public.stripe_disputes, public.stripe_marketplace_ledger
to service_role;
grant usage, select on sequence public.stripe_marketplace_ledger_id_seq to service_role;

create or replace function public.upsert_stripe_connected_account(
  p_pro_id uuid, p_account_id text, p_country_code text, p_details_submitted boolean,
  p_charges_enabled boolean, p_payouts_enabled boolean, p_transfers_capability text,
  p_currently_due jsonb, p_past_due jsonb, p_disabled_reason text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_account_id !~ '^acct_[A-Za-z0-9]+$' or p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid Stripe account details';
  end if;
  insert into public.stripe_connected_accounts(
    pro_id,stripe_account_id,country_code,details_submitted,charges_enabled,payouts_enabled,
    transfers_capability,requirements_currently_due,requirements_past_due,disabled_reason,
    onboarding_completed_at,last_synced_at,updated_at
  ) values (
    p_pro_id,p_account_id,p_country_code,coalesce(p_details_submitted,false),
    coalesce(p_charges_enabled,false),coalesce(p_payouts_enabled,false),p_transfers_capability,
    coalesce(p_currently_due,'[]'::jsonb),coalesce(p_past_due,'[]'::jsonb),p_disabled_reason,
    case when coalesce(p_details_submitted,false) then clock_timestamp() else null end,
    clock_timestamp(),clock_timestamp()
  )
  on conflict (pro_id) do update set
    stripe_account_id=excluded.stripe_account_id,
    country_code=excluded.country_code,
    details_submitted=excluded.details_submitted,
    charges_enabled=excluded.charges_enabled,
    payouts_enabled=excluded.payouts_enabled,
    transfers_capability=excluded.transfers_capability,
    requirements_currently_due=excluded.requirements_currently_due,
    requirements_past_due=excluded.requirements_past_due,
    disabled_reason=excluded.disabled_reason,
    onboarding_completed_at=case when excluded.details_submitted
      then coalesce(public.stripe_connected_accounts.onboarding_completed_at,clock_timestamp())
      else null end,
    last_synced_at=clock_timestamp(),updated_at=clock_timestamp();
end;
$$;

create or replace function public.get_my_stripe_connect_status()
returns table(country_code char(2), details_submitted boolean, charges_enabled boolean,
  payouts_enabled boolean, requirements_currently_due jsonb, requirements_past_due jsonb,
  disabled_reason text)
language sql stable security definer set search_path = ''
as $$
  select a.country_code,a.details_submitted,a.charges_enabled,a.payouts_enabled,
    a.requirements_currently_due,a.requirements_past_due,a.disabled_reason
  from public.stripe_connected_accounts a
  where a.pro_id=auth.uid()
    and exists(select 1 from public.pro_profiles p where p.user_id=auth.uid())
    and auth.uid() is not null;
$$;

create or replace function public.request_stripe_refund(
  p_booking_id uuid, p_amount_minor bigint, p_reason text, p_note text, p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_refund_id uuid;
  v_total_minor bigint;
  v_remaining bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_booking_id is null or p_amount_minor is null or p_amount_minor<=0
    or p_idempotency_key is null or length(p_idempotency_key) not between 16 and 128
    or p_reason not in ('duplicate','fraudulent','requested_by_customer','service_not_provided','service_issue','other')
    or length(coalesce(p_note,''))>1000 then raise exception 'invalid refund request'; end if;

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
    p_booking_id,v_payment.id,auth.uid(),p_idempotency_key,p_amount_minor,v_payment.currency_code,p_reason,nullif(trim(p_note),'')
  ) returning id into v_refund_id;

  return v_refund_id;
end;
$$;

create or replace function public.prepare_stripe_refund(
  p_refund_request_id uuid
) returns table(refund_id uuid,payment_intent_id text,amount_minor bigint,currency_code text,
  transfer_id text,transfer_reversal_amount_minor bigint,booking_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_refund public.stripe_refund_requests%rowtype;
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_transfer public.stripe_transfers%rowtype;
begin
  if auth.uid() is null or not public.has_admin_permission('finance.reconcile') then
    raise exception 'finance permission required';
  end if;
  select * into v_refund from public.stripe_refund_requests where id=p_refund_request_id for update;
  if not found then raise exception 'refund request not found'; end if;
  if v_refund.status='succeeded' then raise exception 'refund already completed'; end if;
  if v_refund.status not in ('requested','failed','processing') then raise exception 'refund is already completed or rejected'; end if;

  select * into v_payment from public.payments where id=v_refund.payment_id for update;
  select * into v_booking from public.bookings where id=v_refund.booking_id;
  select * into v_transfer from public.stripe_transfers where booking_id=v_refund.booking_id;
  if v_payment.provider_ref is null then raise exception 'payment has no Stripe PaymentIntent'; end if;

  update public.stripe_refund_requests set status='processing',reviewed_by=auth.uid(),
    reviewed_at=coalesce(reviewed_at,clock_timestamp()),
    transfer_reversal_amount_minor=case when v_transfer.stripe_transfer_id is null then 0
      else least(v_transfer.amount_minor,
        floor(v_refund.amount_minor::numeric * v_booking.pro_payout_dop / nullif(v_booking.price_dop,0))::bigint)
      end,
    updated_at=clock_timestamp() where id=v_refund.id;

  return query select v_refund.id,v_payment.provider_ref,v_refund.amount_minor,v_refund.currency_code,
    v_transfer.stripe_transfer_id,
    case when v_transfer.stripe_transfer_id is null then 0
      else least(v_transfer.amount_minor,
        floor(v_refund.amount_minor::numeric * v_booking.pro_payout_dop / nullif(v_booking.price_dop,0))::bigint)
    end,
    v_refund.booking_id;
end;
$$;

create or replace function public.complete_stripe_refund(
  p_refund_id uuid,p_stripe_refund_id text,p_transfer_reversal_id text,p_failure_code text,p_failure_message text,p_reversal_pending boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_refund public.stripe_refund_requests%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  select * into v_refund from public.stripe_refund_requests where id=p_refund_id for update;
  if not found then raise exception 'refund request not found'; end if;
  if v_refund.status='succeeded' then return; end if;
  if p_stripe_refund_id is not null then
    update public.stripe_refund_requests set status='succeeded',stripe_refund_id=p_stripe_refund_id,
      stripe_transfer_reversal_id=p_transfer_reversal_id,transfer_reversal_pending=coalesce(p_reversal_pending,false),failure_code=null,failure_message=case when coalesce(p_reversal_pending,false) then 'Customer refund succeeded; professional transfer reversal requires reconciliation' else null end,
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
  else
    update public.stripe_refund_requests set status='failed',failure_code=p_failure_code,
      failure_message=left(p_failure_message,500),updated_at=clock_timestamp() where id=p_refund_id;
  end if;
end;
$$;

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
  if not found or v_booking.status<>'completed' or v_booking.pro_id is null then
    raise exception 'booking must be completed and assigned before settlement';
  end if;
  select * into v_payment from public.payments where booking_id=p_booking_id
    and provider='stripe' and status in ('held','released') order by created_at desc limit 1 for update;
  if not found or v_payment.provider_ref is null then raise exception 'captured Stripe payment not found'; end if;
  if v_payment.refunded_amount_minor>0 then raise exception 'partially or fully refunded booking requires manual settlement review'; end if;
  select * into v_account from public.stripe_connected_accounts where pro_id=v_booking.pro_id for update;
  if not found or not v_account.payouts_enabled or not v_account.details_submitted
    or v_account.transfers_capability <> 'active' then
    raise exception 'professional Stripe account is not payout eligible';
  end if;

  insert into public.stripe_transfers(
    booking_id,payment_id,pro_id,stripe_account_id,amount_minor,currency_code,transfer_group,status
  ) values (
    p_booking_id,v_payment.id,v_booking.pro_id,v_account.stripe_account_id,
    round(v_booking.pro_payout_dop*100)::bigint,v_payment.currency_code,'klipp_booking_'||p_booking_id::text,'queued'
  ) on conflict(booking_id) do update set updated_at=clock_timestamp()
  returning * into v_transfer;

  return query select v_transfer.id,v_payment.provider_ref,v_transfer.stripe_account_id,
    v_transfer.amount_minor,v_transfer.currency_code,v_transfer.transfer_group;
end;
$$;

create or replace function public.complete_stripe_transfer(
  p_transfer_row_id uuid,p_stripe_transfer_id text,p_failure_code text,p_failure_message text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_transfer public.stripe_transfers%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  select * into v_transfer from public.stripe_transfers where id=p_transfer_row_id for update;
  if not found then raise exception 'transfer record not found'; end if;
  if p_stripe_transfer_id is not null then
    if v_transfer.status='paid' and v_transfer.stripe_transfer_id=p_stripe_transfer_id then return; end if;
    update public.stripe_transfers set status='paid',stripe_transfer_id=p_stripe_transfer_id,
      failure_code=null,failure_message=null,paid_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=p_transfer_row_id;
    update public.payments set status='released',released_at=coalesce(released_at,clock_timestamp()),
      updated_at=clock_timestamp() where id=v_transfer.payment_id and status='held';
    insert into public.stripe_marketplace_ledger(
      booking_id,payment_id,transfer_id,entry_type,amount_minor,currency_code,
      external_reference,idempotency_key
    ) values (v_transfer.booking_id,v_transfer.payment_id,v_transfer.id,'professional_transfer',
      -v_transfer.amount_minor,v_transfer.currency_code,p_stripe_transfer_id,'transfer:'||v_transfer.id::text)
    on conflict(idempotency_key) do nothing;
  else
    update public.stripe_transfers set status='failed',failure_code=p_failure_code,
      failure_message=left(p_failure_message,500),updated_at=clock_timestamp()
      where id=p_transfer_row_id and status<>'paid';
  end if;
end;
$$;

create or replace function public.process_stripe_connect_webhook_event(
  p_event_id text,p_event_type text,p_object_id text,p_account_id text,
  p_details_submitted boolean,p_charges_enabled boolean,p_payouts_enabled boolean,
  p_transfers_capability text,p_currently_due jsonb,p_past_due jsonb,p_disabled_reason text,
  p_dispute_charge_id text,p_payment_intent_id text,p_dispute_amount_minor bigint,
  p_currency text,p_dispute_status text,p_dispute_reason text,p_evidence_due_at timestamptz
) returns text
language plpgsql security definer set search_path = ''
as $$
declare v_booking_id uuid; v_account public.stripe_connected_accounts%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required'; end if;
  if p_event_id is null or p_event_id !~ '^evt_[A-Za-z0-9]+$' then raise exception 'invalid event id'; end if;
  insert into public.stripe_connect_webhook_events(event_id,event_type,object_id)
    values(p_event_id,p_event_type,p_object_id) on conflict(event_id) do nothing;
  if exists(select 1 from public.stripe_connect_webhook_events where event_id=p_event_id and processed_at is not null) then
    return 'already_processed';
  end if;

  if p_event_type='account.updated' and p_account_id is not null then
    select * into v_account from public.stripe_connected_accounts where stripe_account_id=p_account_id;
    if found then
      update public.stripe_connected_accounts set
        details_submitted=coalesce(p_details_submitted,false),
        charges_enabled=coalesce(p_charges_enabled,false),
        payouts_enabled=coalesce(p_payouts_enabled,false),
        transfers_capability=p_transfers_capability,
        requirements_currently_due=coalesce(p_currently_due,'[]'::jsonb),
        requirements_past_due=coalesce(p_past_due,'[]'::jsonb),
        disabled_reason=p_disabled_reason,last_synced_at=clock_timestamp(),updated_at=clock_timestamp()
      where stripe_account_id=p_account_id;
    end if;
  elsif p_event_type like 'charge.dispute.%' and p_object_id is not null then
    select id into v_booking_id from public.payments
      where provider='stripe' and provider_ref=p_payment_intent_id limit 1;
    insert into public.stripe_disputes(
      stripe_dispute_id,stripe_charge_id,payment_intent_id,booking_id,amount_minor,currency_code,
      status,reason,evidence_due_at,closed_at
    ) values (
      p_object_id,p_dispute_charge_id,p_payment_intent_id,v_booking_id,
      coalesce(p_dispute_amount_minor,0),lower(coalesce(p_currency,'dop')),
      coalesce(p_dispute_status,'unknown'),p_dispute_reason,p_evidence_due_at,
      case when p_event_type='charge.dispute.closed' then clock_timestamp() else null end
    ) on conflict(stripe_dispute_id) do update set
      status=excluded.status,reason=excluded.reason,evidence_due_at=excluded.evidence_due_at,
      closed_at=excluded.closed_at,raw_status_updated_at=clock_timestamp(),updated_at=clock_timestamp();
  end if;

  update public.stripe_connect_webhook_events set processed_at=clock_timestamp(),last_error=null
    where event_id=p_event_id;
  return 'processed';
exception when others then
  update public.stripe_connect_webhook_events set last_error=left(sqlerrm,500)
    where event_id=p_event_id;
  raise;
end;
$$;

revoke all on function public.upsert_stripe_connected_account(uuid,text,text,boolean,boolean,boolean,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.get_my_stripe_connect_status() from public,anon;
revoke all on function public.request_stripe_refund(uuid,bigint,text,text,text) from public,anon;
revoke all on function public.prepare_stripe_refund(uuid) from public,anon,authenticated;
revoke all on function public.complete_stripe_refund(uuid,text,text,text,text,boolean) from public,anon,authenticated;
revoke all on function public.prepare_stripe_transfer(uuid) from public,anon,authenticated;
revoke all on function public.complete_stripe_transfer(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.process_stripe_connect_webhook_event(text,text,text,text,boolean,boolean,boolean,text,jsonb,jsonb,text,text,text,bigint,text,text,text,timestamptz) from public,anon,authenticated;

grant execute on function public.upsert_stripe_connected_account(uuid,text,text,boolean,boolean,boolean,text,jsonb,jsonb,text) to service_role;
grant execute on function public.get_my_stripe_connect_status() to authenticated;
grant execute on function public.request_stripe_refund(uuid,bigint,text,text,text) to authenticated;
grant execute on function public.prepare_stripe_refund(uuid) to authenticated;
grant execute on function public.complete_stripe_refund(uuid,text,text,text,text,boolean) to service_role;
grant execute on function public.prepare_stripe_transfer(uuid) to service_role;
grant execute on function public.complete_stripe_transfer(uuid,text,text,text) to service_role;
grant execute on function public.process_stripe_connect_webhook_event(text,text,text,text,boolean,boolean,boolean,text,jsonb,jsonb,text,text,text,bigint,text,text,text,timestamptz) to service_role;

-- Operational ledger: append one immutable set of entries when a signed Stripe
-- webhook transitions a payment into held (captured but not yet transferred).
create or replace function public.record_stripe_payment_ledger()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings%rowtype;
begin
  if new.provider='stripe' and new.status='held' and old.status is distinct from 'held' then
    select * into v_booking from public.bookings where id=new.booking_id;
    if found then
      insert into public.stripe_marketplace_ledger(booking_id,payment_id,entry_type,amount_minor,currency_code,idempotency_key)
      values
        (new.booking_id,new.id,'customer_charge',round(new.amount_dop*100)::bigint,new.currency_code,'charge:'||new.id::text),
        (new.booking_id,new.id,'platform_fee',round(v_booking.commission_dop*100)::bigint,new.currency_code,'fee:'||new.id::text),
        (new.booking_id,new.id,'professional_payable',round(v_booking.pro_payout_dop*100)::bigint,new.currency_code,'payable:'||new.id::text)
      on conflict(idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_record_stripe_payment_ledger on public.payments;
create trigger trg_record_stripe_payment_ledger
after update of status on public.payments
for each row execute function public.record_stripe_payment_ledger();
revoke all on function public.record_stripe_payment_ledger() from public,anon,authenticated;
