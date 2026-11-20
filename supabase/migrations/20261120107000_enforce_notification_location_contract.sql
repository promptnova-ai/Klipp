-- Enforce the booking-request notification privacy contract at the table boundary.
-- This protects against future trigger/RPC regressions, not just the current producer.

UPDATE public.notifications
SET data = coalesce(data, '{}'::jsonb) - ARRAY[
  'addressText','landmarkNotes','clientLat','clientLng',
  'latitude','longitude','lat','lng','address','street',
  'referencesText','location','coordinates','geolocation',
  'clientLocation','formattedAddress','fullAddress','addressLine',
  'placeId','postalCode','unitNumber'
]
WHERE type = 'booking_request'
  AND coalesce(data, '{}'::jsonb) ?| ARRAY[
    'addressText','landmarkNotes','clientLat','clientLng',
    'latitude','longitude','lat','lng','address','street',
    'referencesText','location','coordinates','geolocation',
    'clientLocation','formattedAddress','fullAddress','addressLine',
    'placeId','postalCode','unitNumber'
  ];

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_booking_request_no_exact_location'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_booking_request_no_exact_location
      CHECK (
        type <> 'booking_request'
        OR NOT (
          coalesce(data, '{}'::jsonb) ?| ARRAY[
            'addressText','landmarkNotes','clientLat','clientLng',
            'latitude','longitude','lat','lng','address','street',
            'referencesText','location','coordinates','geolocation',
            'clientLocation','formattedAddress','fullAddress','addressLine',
            'placeId','postalCode','unitNumber'
          ]
        )
      ) NOT VALID;
  END IF;
END;
$block$;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_booking_request_no_exact_location;
