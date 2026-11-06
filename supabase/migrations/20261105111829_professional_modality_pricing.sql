-- Per-professional prices and durations for every catalog modality.
create table if not exists public.pro_service_tier_prices (
  pro_service_id uuid not null references public.pro_services(id) on delete cascade,
  pricing_tier_id integer not null references public.pricing_tiers(id) on delete cascade,
  price_dop numeric(10,2) not null check (price_dop > 0),
  est_minutes integer not null check (est_minutes > 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (pro_service_id, pricing_tier_id)
);
create index if not exists pro_service_tier_prices_tier_idx
  on public.pro_service_tier_prices (pricing_tier_id, active);
alter table public.pro_service_tier_prices enable row level security;
drop policy if exists pro_service_tier_prices_manage_own on public.pro_service_tier_prices;
create policy pro_service_tier_prices_manage_own on public.pro_service_tier_prices
  for all using (exists (select 1 from public.pro_services ps where ps.id = pro_service_tier_prices.pro_service_id and ps.pro_id = (select auth.uid())))
  with check (exists (select 1 from public.pro_services ps where ps.id = pro_service_tier_prices.pro_service_id and ps.pro_id = (select auth.uid())));
drop policy if exists pro_service_tier_prices_read_active on public.pro_service_tier_prices;
create policy pro_service_tier_prices_read_active on public.pro_service_tier_prices
  for select using (active and exists (select 1 from public.pro_services ps where ps.id = pro_service_tier_prices.pro_service_id and ps.active));
