-- Klipp: restrict direct access to payment and payout records.
-- Clients may read rows allowed by existing RLS policies. Financial writes
-- must be performed by trusted backend code using service_role.
-- service_role and postgres privileges are intentionally untouched.

REVOKE ALL PRIVILEGES ON TABLE public.payments
  FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.payouts
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.payments TO authenticated;
GRANT SELECT ON TABLE public.payouts TO authenticated;

-- Existing RLS policies remain responsible for row-level visibility:
-- payments_select_client and payouts_select_pro.
