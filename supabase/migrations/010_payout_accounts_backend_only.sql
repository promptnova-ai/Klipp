-- Klipp: enforce backend-only access to professional payout accounts.
-- These records contain bank account details and are not accessed directly
-- by the mobile app. Trusted backend code must use service_role.

DROP POLICY IF EXISTS payout_accounts_own ON public.pro_payout_accounts;

REVOKE ALL PRIVILEGES ON TABLE public.pro_payout_accounts
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.pro_payout_accounts IS
  'Backend-only payout details; do not grant direct access to client roles.';
