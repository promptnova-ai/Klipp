-- One active primary profession per Klipp PRO account.
-- Stage this migration after reviewing existing pro_services data.
-- Do not silently discard a professional's existing offers.
do $$
begin
  if exists (
    select 1 from public.pro_services
    where active is true
    group by pro_id having count(*) > 1
  ) then
    raise exception 'Resolve professionals with multiple active service types before enforcing the one-profession rule';
  end if;
end $$;

alter table public.pro_services
  add column if not exists details jsonb not null default '{}'::jsonb;

create unique index if not exists pro_services_one_active_profession
  on public.pro_services(pro_id)
  where active is true;

-- Individual profession-specific answers live on the professional offer,
-- not in auth user_metadata. The onboarding synchronization must populate
-- this column before the new UI can be treated as end-to-end complete.
comment on column public.pro_services.details is
  'Profession-specific registration details, validated against the active service catalog';
