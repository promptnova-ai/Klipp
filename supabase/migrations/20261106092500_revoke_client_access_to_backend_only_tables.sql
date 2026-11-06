-- Backend-only tables: RLS has no client policies by design. Remove historical
-- broad table grants so access is enforced at the privilege layer as well.
-- SECURITY DEFINER RPCs/triggers and service_role continue to perform the
-- validated operational reads and writes.
revoke all privileges on table public.admin_audit_log
  from public, anon, authenticated;

revoke all privileges on table public.booking_eta_tracking
  from public, anon, authenticated;

revoke all privileges on table public.platform_settings
  from public, anon, authenticated;
