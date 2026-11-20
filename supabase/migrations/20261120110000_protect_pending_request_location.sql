-- Protect exact customer location until a professional accepts a request.
-- Pending professionals receive only a coarse service sector in the request RPC.
-- Exact address, landmarks and coordinates are available only to the assigned pro.

drop policy if exists bookings_select_request_recipient on public.bookings;

drop policy if exists addresses_select_request_recipient on public.addresses;
create policy addresses_select_assigned_professional
  on public.addresses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.bookings b
      where b.address_id = addresses.id
        and b.pro_id = (select auth.uid())
    )
  );

create or replace function public.pro_list_incoming_booking_requests()
returns table(
  id uuid,
  booking_id uuid,
  pro_id uuid,
  status public.request_status,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  client_name text,
  client_avatar_url text,
  service_name text,
  pricing_tier_label text,
  scheduled_start timestamptz,
  est_minutes integer,
  pro_payout_dop numeric,
  address_text text,
  landmark_notes text,
  client_lat double precision,
  client_lng double precision
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    br.id,
    br.booking_id,
    br.pro_id,
    br.status,
    br.created_at,
    br.expires_at,
    br.responded_at,
    coalesce(nullif(trim(client.full_name), ''), 'Cliente Klipp'),
    client.avatar_url,
    service.name,
    tier.label,
    booking.scheduled_start,
    coalesce(tp.est_minutes, ps.est_minutes, booking.est_minutes),
    coalesce(
      case when booking.pricing_tier_id is not null then tp.price_dop else ps.base_price_dop end,
      booking.price_dop
    ) - round(
      coalesce(
        case when booking.pricing_tier_id is not null then tp.price_dop else ps.base_price_dop end,
        booking.price_dop
      ) * coalesce(booking.commission_pct, 7.00) / 100,
      2
    ),
    coalesce('Zona aproximada · ' || nullif(trim(sector.name), ''), 'Zona aproximada'),
    null::text,
    null::double precision,
    null::double precision
  from public.booking_requests br
  join public.bookings booking on booking.id = br.booking_id
  join public.profiles client on client.id = booking.client_id
  join public.service_types service on service.id = booking.service_type_id
  left join public.pricing_tiers tier on tier.id = booking.pricing_tier_id
  left join public.addresses address on address.id = booking.address_id
  left join public.sectors sector on sector.id = address.sector_id
  left join public.pro_services ps
    on ps.pro_id = br.pro_id
   and ps.service_type_id = booking.service_type_id
   and ps.active
  left join public.pro_service_tier_prices tp
    on tp.pro_service_id = ps.id
   and tp.pricing_tier_id = booking.pricing_tier_id
   and tp.active
  where auth.uid() is not null
    and br.pro_id = auth.uid()
    and br.status = 'pending'
    and br.expires_at > now()
  order by br.created_at desc;
$function$;

create or replace function public.pro_list_pending_booking_reassignments()
returns table(
  request_id uuid,
  booking_id uuid,
  original_professional_name text,
  scheduled_start timestamptz,
  est_minutes integer,
  pro_payout_dop numeric,
  address_text text,
  landmark_notes text,
  service_name text,
  pricing_tier_label text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.booking_reassignment_requests
  set status = 'expired', responded_at = now()
  where replacement_pro_id = auth.uid()
    and status = 'pending'
    and expires_at <= now();

  return query
  select
    request_record.id,
    booking.id,
    original_profile.full_name,
    booking.scheduled_start,
    booking.est_minutes,
    booking.pro_payout_dop,
    coalesce('Zona aproximada · ' || nullif(trim(sector.name), ''), 'Zona aproximada'),
    null::text,
    service.name,
    tier.label,
    request_record.expires_at
  from public.booking_reassignment_requests request_record
  join public.bookings booking on booking.id = request_record.booking_id
  join public.profiles original_profile on original_profile.id = request_record.original_pro_id
  join public.service_types service on service.id = booking.service_type_id
  left join public.pricing_tiers tier on tier.id = booking.pricing_tier_id
  left join public.addresses address on address.id = booking.address_id
  left join public.sectors sector on sector.id = address.sector_id
  where request_record.replacement_pro_id = auth.uid()
    and request_record.status = 'pending'
    and request_record.expires_at > now()
    and booking.status = 'scheduled'
    and booking.pro_id = request_record.original_pro_id
  order by booking.scheduled_start;
end;
$function$;

revoke all on function public.pro_list_incoming_booking_requests() from public, anon;
grant execute on function public.pro_list_incoming_booking_requests() to authenticated;
revoke all on function public.pro_list_pending_booking_reassignments() from public, anon;
grant execute on function public.pro_list_pending_booking_reassignments() to authenticated;

-- Clients need payment status and amount, not provider reconciliation secrets.
revoke select on table public.payments from authenticated;
revoke select (
  provider_ref,
  provider_order_number,
  authorization_code,
  response_code,
  response_message,
  rrn,
  auth_hash_verified_at
) on public.payments from authenticated;
grant select (
  id,
  booking_id,
  provider,
  amount_dop,
  status,
  created_at,
  held_at,
  released_at,
  updated_at
) on public.payments to authenticated;
