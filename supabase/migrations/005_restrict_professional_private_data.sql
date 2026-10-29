-- Keep professional schedules and work areas private to their owner.
drop policy if exists pro_sectors_read on public.pro_sectors;
create policy pro_sectors_read_own
  on public.pro_sectors
  for select
  to authenticated
  using (pro_id = auth.uid());

drop policy if exists pro_availability_read on public.pro_availability;
create policy pro_availability_read_own
  on public.pro_availability
  for select
  to authenticated
  using (pro_id = auth.uid());

-- Payout account details are managed by trusted backend code only.
drop policy if exists payout_accounts_own on public.pro_payout_accounts;
revoke all privileges on table public.pro_payout_accounts from public, anon, authenticated;

comment on table public.pro_payout_accounts is
  'Backend-only payout details; do not grant direct access to client roles.';