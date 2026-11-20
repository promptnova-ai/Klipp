-- Make nearest-professional ordering deterministic when distance, rating
-- and completed-job count are identical (for example, co-located pros).
do $migration$
declare
  v_definition text;
  v_old constant text := 'ORDER BY 2, e.rating_avg DESC, e.jobs_completed DESC';
  v_new constant text := 'ORDER BY 2, e.rating_avg DESC, e.jobs_completed DESC, e.user_id ASC';
begin
  select pg_get_functiondef('public.find_auto_candidates(uuid,integer)'::regprocedure)
    into v_definition;
  if position(v_old in v_definition)=0 then
    raise exception 'Expected candidate ordering was not found; aborting safely';
  end if;
  v_definition := replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$migration$;
