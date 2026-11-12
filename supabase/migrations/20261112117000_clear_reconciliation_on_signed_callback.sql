DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  v_definition := pg_get_functiondef('public.finalize_azul_payment_attempt(uuid,text,numeric,text,text,text,boolean)'::regprocedure);

  v_old := E'        auth_hash_verified_at=clock_timestamp(),\n        updated_at=clock_timestamp()';
  v_new := E'        auth_hash_verified_at=clock_timestamp(),\n        reconciliation_required_at=NULL,\n        updated_at=clock_timestamp()';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate declined callback reconciliation clear point';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := E'        response_message=''Approved by AZUL; refund reconciliation required'',\n        updated_at=clock_timestamp()';
  v_new := E'        response_message=''Approved by AZUL; refund reconciliation required'',\n        reconciliation_required_at=NULL,\n        updated_at=clock_timestamp()';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate refund callback reconciliation clear point';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := E'      refund_required_at=NULL,\n      refund_reason=NULL,\n      updated_at=clock_timestamp()';
  v_new := E'      refund_required_at=NULL,\n      refund_reason=NULL,\n      reconciliation_required_at=NULL,\n      updated_at=clock_timestamp()';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not locate successful callback reconciliation clear point';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$migration$;
