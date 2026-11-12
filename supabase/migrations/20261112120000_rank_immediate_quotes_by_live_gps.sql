-- Immediate "Cerca de mí" quote ranking must use the professional's live
-- GPS location, not only the centre of their service-area polygon.
DO $migration$
DECLARE
  v_definition text;
  v_old_distance text;
  v_new_distance text;
  v_old_join text;
  v_new_join text;
  v_old_online text;
  v_new_online text;
BEGIN
  v_definition := pg_get_functiondef('public.get_auto_service_quote(integer,integer,double precision,double precision,timestamp with time zone,boolean)'::regprocedure);

  v_old_distance := E'    extensions.st_distance(\n      extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude, pp.service_area_latitude),4326)::extensions.geography,\n      v_point\n    )';
  v_new_distance := E'    extensions.st_distance(\n      CASE\n        WHEN p_require_online AND live.latitude IS NOT NULL AND live.longitude IS NOT NULL THEN\n          extensions.st_setsrid(extensions.st_makepoint(live.longitude,live.latitude),4326)::extensions.geography\n        ELSE\n          extensions.st_setsrid(extensions.st_makepoint(pp.service_area_longitude,pp.service_area_latitude),4326)::extensions.geography\n      END,\n      v_point\n    )';
  IF position(v_old_distance IN v_definition)=0 THEN RAISE EXCEPTION 'Could not locate quote distance expression'; END IF;
  v_definition:=replace(v_definition,v_old_distance,v_new_distance);

  v_old_join := E'  JOIN public.profiles pr ON pr.id = pp.user_id\n  WHERE pp.active';
  v_new_join := E'  JOIN public.profiles pr ON pr.id = pp.user_id\n  LEFT JOIN public.pro_presence live\n    ON live.pro_id=pp.user_id\n   AND live.is_online\n   AND live.last_seen_at >= clock_timestamp() - interval ''90 seconds''\n  WHERE pp.active';
  IF position(v_old_join IN v_definition)=0 THEN RAISE EXCEPTION 'Could not locate quote profile join'; END IF;
  v_definition:=replace(v_definition,v_old_join,v_new_join);

  v_old_online := E'    AND (\n      NOT p_require_online OR EXISTS (\n        SELECT 1 FROM public.pro_presence presence\n        WHERE presence.pro_id = pp.user_id\n          AND presence.is_online\n          AND presence.last_seen_at >= clock_timestamp() - interval ''90 seconds''\n      )\n    )';
  v_new_online := E'    AND (NOT p_require_online OR live.pro_id IS NOT NULL)';
  IF position(v_old_online IN v_definition)=0 THEN RAISE EXCEPTION 'Could not locate online presence filter'; END IF;
  EXECUTE replace(v_definition,v_old_online,v_new_online);
END;
$migration$;
