-- Public work gallery for approved Klipp professionals.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pro-portfolio', 'pro-portfolio', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create table if not exists public.pro_portfolio (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pro_portfolio_public_order_idx
  on public.pro_portfolio (pro_id, sort_order, created_at desc);

alter table public.pro_portfolio enable row level security;

drop policy if exists pro_portfolio_public_read on public.pro_portfolio;
create policy pro_portfolio_public_read
  on public.pro_portfolio for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.pro_profiles pp
      where pp.user_id = pro_portfolio.pro_id
        and pp.active
        and pp.verification_status = 'approved'
    )
  );

drop policy if exists pro_portfolio_owner_insert on public.pro_portfolio;
create policy pro_portfolio_owner_insert
  on public.pro_portfolio for insert
  to authenticated
  with check (
    pro_id = auth.uid()
    and exists (
      select 1 from public.pro_profiles pp
      where pp.user_id = auth.uid()
        and pp.active
        and pp.verification_status = 'approved'
    )
  );

drop policy if exists pro_portfolio_owner_delete on public.pro_portfolio;
create policy pro_portfolio_owner_delete
  on public.pro_portfolio for delete
  to authenticated
  using (pro_id = auth.uid());

drop policy if exists pro_portfolio_storage_owner_insert on storage.objects;
create policy pro_portfolio_storage_owner_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pro-portfolio'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.pro_profiles pp
      where pp.user_id = auth.uid()
        and pp.active
        and pp.verification_status = 'approved'
    )
  );

drop policy if exists pro_portfolio_storage_owner_delete on storage.objects;
create policy pro_portfolio_storage_owner_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pro-portfolio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

grant select on public.pro_portfolio to anon, authenticated;
grant insert, delete on public.pro_portfolio to authenticated;
