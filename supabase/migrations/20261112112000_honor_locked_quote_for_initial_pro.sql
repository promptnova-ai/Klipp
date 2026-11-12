-- The initially quoted professional must honor the price snapshot even if
-- they later edit their public tariff. Only replacement professionals must
-- currently match the locked price and duration.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.respond_to_request_unchecked(uuid,boolean)'::regprocedure);
  v_old := E'  IF v_price IS DISTINCT FROM v_booking.price_dop OR v_minutes IS DISTINCT FROM v_booking.est_minutes THEN\n    RAISE EXCEPTION ''professional tariff no longer matches the accepted quote'';\n  END IF;';
  v_new := E'  IF v_booking.pro_id = v_req.pro_id THEN\n    -- This is the professional whose exact tariff was accepted and paid.\n    -- Keep the stored snapshot even if their public tariff changed afterwards.\n    v_price := v_booking.price_dop;\n    v_minutes := v_booking.est_minutes;\n  ELSIF v_price IS DISTINCT FROM v_booking.price_dop OR v_minutes IS DISTINCT FROM v_booking.est_minutes THEN\n    -- A replacement is eligible only at the same customer-approved amount.\n    RAISE EXCEPTION ''replacement professional tariff does not match the accepted quote'';\n  END IF;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate locked quote acceptance comparison';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
