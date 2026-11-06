-- Trigger functions are invoked by PostgreSQL triggers, not through PostgREST.
-- Remove the default PUBLIC execute grant from trigger-only SECURITY DEFINER routines.
revoke all on function public.mark_professional_offline_after_missed_offer() from public, anon, authenticated;
revoke all on function public.dispatch_next_auto_booking_round_on_response() from public, anon, authenticated;
revoke all on function public.enforce_active_service_catalog() from public, anon, authenticated;
revoke all on function public.enforce_pro_equipment_policy_on_booking() from public, anon, authenticated;
revoke all on function public.record_booking_status_event() from public, anon, authenticated;
