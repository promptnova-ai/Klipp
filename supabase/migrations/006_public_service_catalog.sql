-- The professional registration flow reads the service catalog before signup,
-- so anonymous visitors must be able to read active catalog entries.
grant select on public.service_types to anon, authenticated;

drop policy if exists service_types_read on public.service_types;
drop policy if exists service_types_read_active on public.service_types;

create policy service_types_read_active
  on public.service_types
  for select
  to anon, authenticated
  using (active);
