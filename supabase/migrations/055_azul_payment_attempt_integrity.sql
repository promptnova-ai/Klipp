-- Payment attempt metadata and idempotency guard for the AZUL hosted checkout.
-- No cardholder data is stored in Klipp. Provider callbacks are verified server-side.

alter table public.payments
  add column if not exists provider_order_number text,
  add column if not exists authorization_code text,
  add column if not exists response_code text,
  add column if not exists response_message text,
  add column if not exists rrn text,
  add column if not exists auth_hash_verified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payments'::regclass
      and conname = 'payments_amount_positive'
  ) then
    alter table public.payments
      add constraint payments_amount_positive check (amount_dop > 0);
  end if;
end
$$;

-- A booking may have only one unresolved checkout/authorization at a time.
-- Failed attempts remain in the ledger and a fresh attempt can be created.
create unique index if not exists payments_one_active_attempt_per_booking
  on public.payments (booking_id)
  where status in ('pending', 'held');

-- AZUL order numbers are unique within a provider and can safely be used to
-- match signed return parameters to the exact payment attempt.
create unique index if not exists payments_provider_order_number_uidx
  on public.payments (provider, provider_order_number)
  where provider_order_number is not null;

create index if not exists payments_status_created_idx
  on public.payments (status, created_at desc);

comment on column public.payments.provider_order_number is
  'Merchant-generated order number sent to the payment provider; not the provider transaction ID.';
comment on column public.payments.auth_hash_verified_at is
  'Set only by trusted backend after verifying the provider response HMAC.';
