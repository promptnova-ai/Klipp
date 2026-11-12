-- A signed AZUL approval can arrive after the local expiry worker already
-- marked the attempt failed. Reconcile that late money movement as refund
-- required instead of discarding it as an ordinary failed payment.
DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.finalize_azul_payment_attempt(uuid,text,numeric,text,text,text,boolean)'::regprocedure);
  v_old := 'IF v_payment.status<>''pending'' THEN RAISE EXCEPTION ''payment attempt is no longer pending''; END IF;';
  v_new := 'IF v_payment.status=''failed'' AND v_payment.response_code IS NULL AND coalesce(v_payment.response_message,'''') LIKE ''Checkout expired%'' AND coalesce(p_response_code,'''')=''00'' THEN NULL; ELSIF v_payment.status<>''pending'' THEN RAISE EXCEPTION ''payment attempt is no longer pending''; END IF;';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate payment pending-state guard';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$migration$;
