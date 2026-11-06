drop function if exists public.pro_list_incoming_booking_requests();

create function public.pro_list_incoming_booking_requests()
returns table(
  id uuid, booking_id uuid, pro_id uuid, status public.request_status,
  created_at timestamptz, expires_at timestamptz, responded_at timestamptz,
  client_name text, client_avatar_url text, service_name text,
  pricing_tier_label text, scheduled_start timestamptz, est_minutes integer,
  pro_payout_dop numeric, address_text text, landmark_notes text,
  client_lat double precision, client_lng double precision
)
language sql stable security definer set search_path = public
as $function$
  select br.id, br.booking_id, br.pro_id, br.status, br.created_at, br.expires_at,
    br.responded_at, coalesce(nullif(trim(client.full_name), ''), 'Cliente Klipp'),
    client.avatar_url, service.name, tier.label, booking.scheduled_start,
    coalesce(tp.est_minutes, ps.est_minutes, booking.est_minutes),
    coalesce(case when booking.pricing_tier_id is not null then tp.price_dop else ps.base_price_dop end, booking.price_dop)
      - round(coalesce(case when booking.pricing_tier_id is not null then tp.price_dop else ps.base_price_dop end, booking.price_dop)
      * coalesce(booking.commission_pct, 7.00) / 100, 2),
    booking.address_text, booking.landmark_notes, booking.client_lat, booking.client_lng
  from public.booking_requests br
  join public.bookings booking on booking.id = br.booking_id
  join public.profiles client on client.id = booking.client_id
  join public.service_types service on service.id = booking.service_type_id
  left join public.pricing_tiers tier on tier.id = booking.pricing_tier_id
  left join public.pro_services ps on ps.pro_id = br.pro_id
    and ps.service_type_id = booking.service_type_id and ps.active
  left join public.pro_service_tier_prices tp on tp.pro_service_id = ps.id
    and tp.pricing_tier_id = booking.pricing_tier_id and tp.active
  where br.pro_id = auth.uid() and br.status = 'pending' and br.expires_at > now()
  order by br.created_at desc;
$function$;
revoke all on function public.pro_list_incoming_booking_requests() from public, anon;
grant execute on function public.pro_list_incoming_booking_requests() to authenticated;
