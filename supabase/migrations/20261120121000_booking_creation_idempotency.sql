-- Prevent duplicate prepaid bookings when the client loses the RPC response.
-- The idempotency record and booking insert share one transaction.
create table if not exists public.booking_creation_idempotency (
  client_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null check (length(request_hash) = 32),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint booking_creation_idempotency_pkey primary key (client_id, idempotency_key),
  constraint booking_creation_idempotency_booking_key unique (booking_id)
);

alter table public.booking_creation_idempotency enable row level security;
revoke all on table public.booking_creation_idempotency from public, anon, authenticated;

create or replace function public.create_stripe_prepaid_service_booking_at_location(
  p_service_type_id integer,
  p_pricing_tier_id integer,
  p_pro_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_address_text text,
  p_landmark_notes text,
  p_scheduled_start timestamptz,
  p_expected_price_dop numeric,
  p_expected_est_minutes integer,
  p_mode public.assignment_mode,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_request_hash text;
  v_existing_hash text;
  v_existing_booking_id uuid;
  v_booking_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_idempotency_key is null then
    raise exception 'idempotency key is required';
  end if;

  v_request_hash := md5(jsonb_build_object(
    'service_type_id', p_service_type_id,
    'pricing_tier_id', p_pricing_tier_id,
    'pro_id', p_pro_id,
    'lat', p_lat,
    'lng', p_lng,
    'address_text', p_address_text,
    'landmark_notes', p_landmark_notes,
    'scheduled_start', p_scheduled_start,
    'expected_price_dop', p_expected_price_dop,
    'expected_est_minutes', p_expected_est_minutes,
    'mode', p_mode
  )::text);

  perform pg_advisory_xact_lock(
    hashtext('klipp_booking_idempotency'),
    hashtext(auth.uid()::text || ':' || p_idempotency_key::text)
  );

  select idem.request_hash, idem.booking_id
    into v_existing_hash, v_existing_booking_id
  from public.booking_creation_idempotency idem
  where idem.client_id = auth.uid()
    and idem.idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing_hash is distinct from v_request_hash then
      raise exception 'idempotency key was already used for different booking details';
    end if;
    return v_existing_booking_id;
  end if;

  v_booking_id := public.create_stripe_prepaid_service_booking_at_location(
    p_service_type_id,
    p_pricing_tier_id,
    p_pro_id,
    p_lat,
    p_lng,
    p_address_text,
    p_landmark_notes,
    p_scheduled_start,
    p_expected_price_dop,
    p_expected_est_minutes,
    p_mode
  );

  insert into public.booking_creation_idempotency (
    client_id, idempotency_key, request_hash, booking_id
  )
  values (auth.uid(), p_idempotency_key, v_request_hash, v_booking_id);

  return v_booking_id;
end;
$function$;

revoke all on function public.create_stripe_prepaid_service_booking_at_location(
  integer, integer, uuid, double precision, double precision, text, text,
  timestamptz, numeric, integer, public.assignment_mode
) from public, anon, authenticated;

revoke all on function public.create_stripe_prepaid_service_booking_at_location(
  integer, integer, uuid, double precision, double precision, text, text,
  timestamptz, numeric, integer, public.assignment_mode, uuid
) from public, anon;

grant execute on function public.create_stripe_prepaid_service_booking_at_location(
  integer, integer, uuid, double precision, double precision, text, text,
  timestamptz, numeric, integer, public.assignment_mode, uuid
) to authenticated;

comment on table public.booking_creation_idempotency is
  'Server-side idempotency records for prepaid booking creation; inaccessible to client roles.';
