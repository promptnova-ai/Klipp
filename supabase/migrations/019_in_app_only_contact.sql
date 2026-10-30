-- Klipp keeps all client-professional communication inside the app.
-- The client UI no longer retrieves professional phone numbers for direct calls.
-- Remove authenticated access to the legacy phone lookup RPC as defense in depth.

revoke all on function public.get_tracking_pro_phone(uuid) from public, anon, authenticated;
