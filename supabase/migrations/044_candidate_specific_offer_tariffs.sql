-- Calculate incoming offer earnings and duration from each recipient's own tariff.
create or replace function public.notify_klipp_booking_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking public.bookings%rowtype;
  v_client_name text;
  v_service_name text;
  v_tier_label text;
  v_title text;
  v_body text;
  v_base_price numeric(10,2);
  v_base_minutes integer;
  v_tier_price numeric(10,2);
  v_tier_minutes integer;
  v_offer_price numeric(10,2);
  v_offer_minutes integer;
  v_commission_pct numeric(5,2);
  v_payout numeric(10,2);
begin
  select * into v_booking
  from public.bookings
  where id = new.booking_id;

  if not found then return new; end if;

  if new.status = 'pending' then
    select coalesce(nullif(trim(full_name), ''), 'Cliente Klipp')
      into v_client_name
    from public.profiles
    where id = v_booking.client_id;

    select name into v_service_name
    from public.service_types
    where id = v_booking.service_type_id;

    select label into v_tier_label
    from public.pricing_tiers
    where id = v_booking.pricing_tier_id;

    select ps.base_price_dop, ps.est_minutes, tp.price_dop, tp.est_minutes
      into v_base_price, v_base_minutes, v_tier_price, v_tier_minutes
    from public.pro_services ps
    left join public.pro_service_tier_prices tp
      on tp.pro_service_id = ps.id
     and tp.pricing_tier_id = v_booking.pricing_tier_id
     and tp.active
    where ps.pro_id = new.pro_id
      and ps.service_type_id = v_booking.service_type_id
      and ps.active
    limit 1;

    if v_booking.pricing_tier_id is not null then
      v_offer_price := coalesce(v_tier_price, v_booking.price_dop);
      v_offer_minutes := coalesce(v_tier_minutes, v_booking.est_minutes);
    else
      v_offer_price := coalesce(v_base_price, v_booking.price_dop);
      v_offer_minutes := coalesce(v_base_minutes, v_booking.est_minutes);
    end if;

    v_commission_pct := coalesce(v_booking.commission_pct, 7.00);
    v_payout := v_offer_price - round(v_offer_price * v_commission_pct / 100, 2);

    v_title := '🚨 Nueva solicitud de servicio';
    v_body := coalesce(v_client_name, 'Un cliente') || ' solicita ' ||
      coalesce(v_service_name, 'un servicio Klipp') ||
      case when v_tier_label is not null then ' · ' || v_tier_label else '' end ||
      ' · Recibirías ' || to_char(v_payout, 'FM999G999G990D00') || ' DOP. Toca para revisar y aceptar.';

    perform public.create_klipp_notification(
      new.pro_id,
      new.booking_id,
      'booking_request',
      v_title,
      v_body,
      jsonb_build_object(
        'bookingId', new.booking_id,
        'requestId', new.id,
        'target', 'pro',
        'clientName', coalesce(v_client_name, 'Cliente Klipp'),
        'serviceName', coalesce(v_service_name, 'Servicio Klipp'),
        'pricingTierLabel', v_tier_label,
        'scheduledStart', v_booking.scheduled_start,
        'estimatedMinutes', v_offer_minutes,
        'offerPriceDop', v_offer_price,
        'professionalPayoutDop', v_payout,
        'addressText', v_booking.address_text,
        'landmarkNotes', v_booking.landmark_notes
      ),
      'booking-request:' || new.id::text || ':pending',
      'booking_updates'
    );
  elsif new.status in ('rejected', 'expired') and v_booking.assignment_mode = 'manual' then
    perform public.create_klipp_notification(
      v_booking.client_id,
      new.booking_id,
      'booking_request_update',
      case when new.status = 'rejected' then 'El profesional no puede aceptar el servicio' else 'La solicitud ha expirado' end,
      case when new.status = 'rejected'
        then 'El profesional seleccionado no está disponible. Puedes elegir otro profesional o buscar una alternativa.'
        else 'El profesional no respondió a tiempo. Puedes volver a intentarlo con otro profesional.'
      end,
      jsonb_build_object('bookingId', new.booking_id, 'requestId', new.id, 'target', 'client', 'requestStatus', new.status),
      'booking-request:' || new.id::text || ':' || new.status::text || ':client',
      'booking_updates'
    );
  end if;

  return new;
end;
$function$;

create or replace function public.pro_list_incoming_booking_requests()
returns table(
  id uuid,
  booking_id uuid,
  pro_id uuid,
  status public.request_status,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  responded_at timestamp with time zone,
  client_name text,
  client_avatar_url text,
  service_name text,
  pricing_tier_label text,
  scheduled_start timestamp with time zone,
  est_minutes integer,
  pro_payout_dop numeric,
  address_text text,
  landmark_notes text
)
language sql
stable
security definer
set search_path to 'public'
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
    booking.address_text,
    booking.landmark_notes
  from public.booking_requests br
  join public.bookings booking on booking.id = br.booking_id
  join public.profiles client on client.id = booking.client_id
  join public.service_types service on service.id = booking.service_type_id
  left join public.pricing_tiers tier on tier.id = booking.pricing_tier_id
  left join public.pro_services ps
    on ps.pro_id = br.pro_id
   and ps.service_type_id = booking.service_type_id
   and ps.active
  left join public.pro_service_tier_prices tp
    on tp.pro_service_id = ps.id
   and tp.pricing_tier_id = booking.pricing_tier_id
   and tp.active
  where br.pro_id = auth.uid()
    and br.status = 'pending'
    and br.expires_at > now()
  order by br.created_at desc;
$function$;
