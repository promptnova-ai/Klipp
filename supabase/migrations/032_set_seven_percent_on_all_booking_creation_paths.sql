-- Ensure legacy/manual booking creation RPCs also use Klipp's 7% commission.
-- The exact price/payout is recalculated again at professional acceptance.
DO $$
DECLARE
  v_signature regprocedure;
  v_definition text;
BEGIN
  v_signature := to_regprocedure(
    'public.create_booking_at_location(uuid,double precision,double precision,text,text,timestamp with time zone)'
  );
  IF v_signature IS NOT NULL THEN
    v_definition := pg_get_functiondef(v_signature);
    v_definition := replace(v_definition, '20.00', '7.00');
    EXECUTE v_definition;
  END IF;

  v_signature := to_regprocedure(
    'public.create_tier_booking_at_location(integer,double precision,double precision,text,text,timestamp with time zone,assignment_mode,uuid)'
  );
  IF v_signature IS NOT NULL THEN
    v_definition := pg_get_functiondef(v_signature);
    v_definition := replace(v_definition, '20.00', '7.00');
    EXECUTE v_definition;
  END IF;
END;
$$;
