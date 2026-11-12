DO $migration$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.get_auto_service_quote(integer,integer,double precision,double precision,timestamp with time zone,boolean)'::regprocedure);
  IF position('ORDER BY distance_m ASC, pp.rating_avg DESC, pp.jobs_completed DESC' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not locate quote ordering clause';
  END IF;
  EXECUTE replace(
    v_definition,
    'ORDER BY distance_m ASC, pp.rating_avg DESC, pp.jobs_completed DESC',
    'ORDER BY 10 ASC, pp.rating_avg DESC, pp.jobs_completed DESC'
  );
END;
$migration$;
