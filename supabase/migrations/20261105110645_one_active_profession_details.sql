-- Enforce one active profession per professional and persist structured profession details.
alter table public.pro_services add column if not exists details jsonb not null default '{}'::jsonb;
create unique index if not exists pro_services_one_active_profession
  on public.pro_services (pro_id) where active is true;
