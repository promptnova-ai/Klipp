-- Klipp security hardening: public professional-card projection and booking RPCs.
--
-- pro_cards is intentionally a narrow SECURITY DEFINER view because the
-- underlying profiles tables contain private columns and their RLS policies
-- are owner-only. Keep the projection read-only and available only to signed-in
-- app users and the trusted backend. Anonymous users do not need this view.
revoke all privileges on table public.pro_cards from public, anon, authenticated;
grant select on table public.pro_cards to authenticated, service_role;

-- Pin both historical create_booking overloads to an empty search_path.
-- Their application objects are schema-qualified; pg_catalog built-ins remain
-- available implicitly. This prevents object-shadowing through mutable schemas.
alter function public.create_booking(uuid, uuid, timestamptz, integer, text)
  set search_path = '';

alter function public.create_booking(integer, uuid, timestamptz, assignment_mode, uuid, text)
  set search_path = '';
