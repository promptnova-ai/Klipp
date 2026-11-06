-- Publish presence changes so the professional screen reflects automatic
-- offline transitions immediately on the same device and any active session.
do $function$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'pro_presence'
     ) then
    alter publication supabase_realtime add table public.pro_presence;
  end if;
end;
$function$;
