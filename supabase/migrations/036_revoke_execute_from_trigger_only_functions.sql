-- These functions are invoked by database triggers, never as client RPCs.
-- Remove default PUBLIC/anon/authenticated EXECUTE grants while preserving
-- trigger execution and the owning postgres role.
revoke execute on function public.enforce_active_service_catalog()
  from public, anon, authenticated, service_role;

revoke execute on function public.enforce_pro_equipment_policy_on_booking()
  from public, anon, authenticated, service_role;

revoke execute on function public.record_booking_status_event()
  from public, anon, authenticated, service_role;
