-- Anonymous clients need only the read-only professional onboarding catalog.
-- Remove inherited/default table privileges elsewhere; RLS remains an additional layer.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;

GRANT SELECT ON TABLE
  public.service_types,
  public.pricing_tiers,
  public.service_equipment_requirements
TO anon;
