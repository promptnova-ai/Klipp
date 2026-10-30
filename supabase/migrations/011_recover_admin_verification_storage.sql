-- Klipp recovery migration 011.
-- Re-applies the admin/verification/storage setup from migration 007 in a
-- guarded, repeatable way for databases where the original migration was
-- only partially applied. Existing service_categories/service_types schema
-- is reused; no user or booking data is deleted.

DO $preflight$
DECLARE
  missing_items text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN missing_items := array_append(missing_items, 'public.profiles'); END IF;
  IF to_regclass('public.pro_profiles') IS NULL THEN missing_items := array_append(missing_items, 'public.pro_profiles'); END IF;
  IF to_regclass('public.service_categories') IS NULL THEN missing_items := array_append(missing_items, 'public.service_categories'); END IF;
  IF to_regclass('public.service_types') IS NULL THEN missing_items := array_append(missing_items, 'public.service_types'); END IF;
  IF to_regclass('public.pricing_tiers') IS NULL THEN missing_items := array_append(missing_items, 'public.pricing_tiers'); END IF;
  IF to_regclass('public.bookings') IS NULL THEN missing_items := array_append(missing_items, 'public.bookings'); END IF;
  IF to_regclass('public.booking_requests') IS NULL THEN missing_items := array_append(missing_items, 'public.booking_requests'); END IF;
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    missing_items := array_append(missing_items, 'Supabase Storage tables (storage.buckets/storage.objects)');
  END IF;
  IF to_regtype('public.user_role') IS NULL THEN missing_items := array_append(missing_items, 'public.user_role enum'); END IF;
  IF to_regtype('public.verification_status') IS NULL THEN missing_items := array_append(missing_items, 'public.verification_status enum'); END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_categories'
      AND column_name IN ('id','name','description','active')
    GROUP BY table_name HAVING count(*) = 4
  ) THEN
    missing_items := array_append(missing_items, 'required service_categories columns (id/name/description/active)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_types'
      AND column_name = 'category_id'
  ) THEN
    missing_items := array_append(missing_items, 'public.service_types.category_id');
  END IF;


  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bookings'
      AND column_name IN ('price_dop','commission_pct','commission_dop','pro_payout_dop')
    GROUP BY table_name HAVING count(*) = 4
  ) THEN
    missing_items := array_append(missing_items, 'required bookings pricing/commission columns');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'booking_requests'
      AND column_name = 'expires_at'
  ) THEN
    missing_items := array_append(missing_items, 'public.booking_requests.expires_at');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pricing_tiers'
      AND column_name IN ('id','label','price_dop','est_minutes')
    GROUP BY table_name HAVING count(*) = 4
  ) THEN
    missing_items := array_append(missing_items, 'required pricing_tiers columns');
  END IF;

  IF cardinality(missing_items) > 0 THEN
    RAISE EXCEPTION 'Klipp recovery migration 011 aborted; missing prerequisites: %',
      array_to_string(missing_items, ', ');
  END IF;
END
$preflight$;

-- Admin-managed professional verification, account roles, and operational settings.
alter table public.pro_profiles
  add column if not exists verification_note text,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_reviewed_by uuid references public.profiles(id);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;

revoke update (id_document_path) on public.pro_profiles from authenticated;

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.platform_settings (key, value)
values
  ('commission_pct', '20'::jsonb),
  ('request_expiry_minutes', '120'::jsonb)
on conflict (key) do nothing;

alter table public.platform_settings enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_list_accounts()
returns table (
  user_id uuid,
  email text,
  email_verified boolean,
  full_name text,
  phone text,
  role user_role,
  created_at timestamptz,
  verification_status verification_status,
  id_document_path text,
  verification_note text,
  verification_reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;

  return query
  select p.id, u.email::text, u.email_confirmed_at is not null, p.full_name, p.phone, p.role, p.created_at,
         pp.verification_status, pp.id_document_path, pp.verification_note,
         pp.verification_reviewed_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.pro_profiles pp on pp.user_id = p.id
  order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role user_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  if p_user_id is null or p_role is null then raise exception 'user and role are required'; end if;
  if p_user_id = auth.uid() then raise exception 'you cannot change your own admin role'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'account not found';
  end if;
  if p_role = 'pro' then
    insert into public.pro_profiles (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;
  end if;

  update public.profiles set role = p_role where id = p_user_id;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values (auth.uid(), 'account.role_changed', p_user_id, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.admin_review_professional(
  p_pro_id uuid,
  p_status verification_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'review status must be approved or rejected';
  end if;
  if p_status = 'rejected' and nullif(trim(p_note), '') is null then
    raise exception 'a reason is required when rejecting verification';
  end if;
  if p_status = 'approved' and not exists (
    select 1 from public.pro_profiles
    where user_id = p_pro_id
      and id_document_path is not null
      and split_part(id_document_path, '/', 1) = p_pro_id::text
      and exists (
        select 1 from storage.objects object
        where object.bucket_id = 'pro-verification-documents'
          and object.name = id_document_path
      )
  ) then
    raise exception 'professional must submit an identity document before approval';
  end if;
  if p_status = 'approved' and not exists (
    select 1 from auth.users where id = p_pro_id and email_confirmed_at is not null
  ) then
    raise exception 'professional email must be confirmed before approval';
  end if;

  update public.pro_profiles
  set verification_status = p_status,
      verification_note = nullif(trim(p_note), ''),
      verification_reviewed_at = now(),
      verification_reviewed_by = auth.uid()
  where user_id = p_pro_id;
  if not found then raise exception 'professional profile not found'; end if;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values (auth.uid(), 'professional.verification_reviewed', p_pro_id,
          jsonb_build_object('status', p_status, 'note', nullif(trim(p_note), '')));
end;
$$;

create or replace function public.submit_pro_verification_document(p_object_path text)
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_object_path is null
    or split_part(p_object_path, '/', 1) <> auth.uid()::text
    or split_part(p_object_path, '/', 2) = '' then
    raise exception 'invalid verification document path';
  end if;
  if not exists (
    select 1 from public.pro_profiles where user_id = auth.uid()
  ) then
    raise exception 'professional profile not found';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'pro-verification-documents'
      and name = p_object_path
      and owner_id = auth.uid()::text
  ) then
    raise exception 'uploaded verification document not found';
  end if;

  update public.pro_profiles
  set id_document_path = p_object_path,
      verification_status = 'pending',
      verification_note = null,
      verification_reviewed_at = null
  where user_id = auth.uid();
end;
$$;

create or replace function public.admin_get_platform_settings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  into result
  from public.platform_settings;
  return result;
end;
$$;

create or replace function public.admin_list_service_categories()
returns table (id integer, name text, description text, active boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  return query
  select category.id, category.name, category.description, category.active
  from public.service_categories category
  order by category.name;
end;
$$;

create or replace function public.admin_update_service_category(
  p_category_id integer,
  p_name text,
  p_description text,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 100 then
    raise exception 'category name must contain 1 to 100 characters';
  end if;
  if p_description is null or length(p_description) > 500 then
    raise exception 'category description must contain at most 500 characters';
  end if;
  update public.service_categories
  set name = trim(p_name), description = p_description, active = p_active
  where id = p_category_id;
  if not found then raise exception 'service category not found'; end if;
  if not p_active then
    update public.service_types set active = false where category_id = p_category_id;
  end if;
  insert into public.admin_audit_log (actor_id, action, target_id, details)
  values (auth.uid(), 'catalog.category_updated', null,
          jsonb_build_object('category_id', p_category_id, 'active', p_active));
end;
$$;

create or replace function public.admin_update_platform_settings(
  p_commission_pct numeric,
  p_request_expiry_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  if p_commission_pct is null or p_commission_pct < 0 or p_commission_pct > 50 then
    raise exception 'commission must be between 0 and 50 percent';
  end if;
  if p_request_expiry_minutes is null or p_request_expiry_minutes not between 15 and 1440 then
    raise exception 'request expiry must be between 15 and 1440 minutes';
  end if;

  insert into public.platform_settings (key, value, updated_at, updated_by)
  values
    ('commission_pct', to_jsonb(p_commission_pct), now(), auth.uid()),
    ('request_expiry_minutes', to_jsonb(p_request_expiry_minutes), now(), auth.uid())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  insert into public.admin_audit_log (actor_id, action, details)
  values (auth.uid(), 'platform.settings_updated',
          jsonb_build_object('commission_pct', p_commission_pct,
                             'request_expiry_minutes', p_request_expiry_minutes));
end;
$$;

create or replace function public.admin_update_service_type(
  p_service_type_id integer,
  p_name text,
  p_description text,
  p_active boolean,
  p_category_id integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 100 then
    raise exception 'service name must contain 1 to 100 characters';
  end if;
  if p_description is null or length(p_description) > 500 then
    raise exception 'service description must contain at most 500 characters';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.service_categories where id = p_category_id and active
  ) then
    raise exception 'service category not found';
  end if;

  update public.service_types
  set name = trim(p_name),
      description = p_description,
      active = p_active,
      category_id = p_category_id
  where id = p_service_type_id;
  if not found then raise exception 'service type not found'; end if;
  insert into public.admin_audit_log (actor_id, action, details)
  values (auth.uid(), 'catalog.service_updated',
          jsonb_build_object('service_type_id', p_service_type_id, 'active', p_active, 'category_id', p_category_id));
end;
$$;

create or replace function public.admin_update_pricing_tier(
  p_tier_id integer,
  p_label text,
  p_price_dop numeric,
  p_est_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  if nullif(trim(p_label), '') is null or length(trim(p_label)) > 100 then
    raise exception 'pricing label must contain 1 to 100 characters';
  end if;
  if p_price_dop is null or p_price_dop <= 0 or p_price_dop > 1000000 then
    raise exception 'price must be between 0 and 1000000 DOP';
  end if;
  if p_est_minutes is null or p_est_minutes not between 15 and 1440 then
    raise exception 'duration must be between 15 and 1440 minutes';
  end if;

  update public.pricing_tiers
  set label = trim(p_label), price_dop = p_price_dop, est_minutes = p_est_minutes
  where id = p_tier_id;
  if not found then raise exception 'pricing tier not found'; end if;
  insert into public.admin_audit_log (actor_id, action, details)
  values (auth.uid(), 'catalog.pricing_tier_updated',
          jsonb_build_object('pricing_tier_id', p_tier_id));
end;
$$;

create or replace function public.apply_booking_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  commission_pct numeric(5,2);
begin
  select (value #>> '{}')::numeric
  into commission_pct
  from public.platform_settings
  where key = 'commission_pct';
  commission_pct := coalesce(commission_pct, 20.00);

  new.commission_pct := commission_pct;
  new.commission_dop := round(new.price_dop * commission_pct / 100, 2);
  new.pro_payout_dop := new.price_dop - new.commission_dop;
  return new;
end;
$$;

create or replace function public.apply_booking_request_expiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expiry_minutes integer;
begin
  select (value #>> '{}')::integer
  into expiry_minutes
  from public.platform_settings
  where key = 'request_expiry_minutes';
  new.expires_at := now() + make_interval(mins => coalesce(expiry_minutes, 120));
  return new;
end;
$$;

drop trigger if exists bookings_apply_platform_commission on public.bookings;
create trigger bookings_apply_platform_commission
before insert on public.bookings
for each row execute function public.apply_booking_commission();

drop trigger if exists booking_requests_apply_platform_expiry on public.booking_requests;
create trigger booking_requests_apply_platform_expiry
before insert on public.booking_requests
for each row execute function public.apply_booking_request_expiry();

revoke all on function public.admin_list_accounts() from public, anon;
revoke all on function public.admin_set_user_role(uuid, user_role) from public, anon;
revoke all on function public.admin_review_professional(uuid, verification_status, text) from public, anon;
revoke all on function public.submit_pro_verification_document(text) from public, anon;
revoke all on function public.admin_get_platform_settings() from public, anon;
revoke all on function public.admin_list_service_categories() from public, anon;
revoke all on function public.admin_update_service_category(integer, text, text, boolean) from public, anon;
revoke all on function public.admin_update_platform_settings(numeric, integer) from public, anon;
revoke all on function public.admin_update_service_type(integer, text, text, boolean, integer) from public, anon;
revoke all on function public.admin_update_pricing_tier(integer, text, numeric, integer) from public, anon;

grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.admin_set_user_role(uuid, user_role) to authenticated;
grant execute on function public.admin_review_professional(uuid, verification_status, text) to authenticated;
grant execute on function public.submit_pro_verification_document(text) to authenticated;
grant execute on function public.admin_get_platform_settings() to authenticated;
grant execute on function public.admin_list_service_categories() to authenticated;
grant execute on function public.admin_update_service_category(integer, text, text, boolean) to authenticated;
grant execute on function public.admin_update_platform_settings(numeric, integer) to authenticated;
grant execute on function public.admin_update_service_type(integer, text, text, boolean, integer) to authenticated;
grant execute on function public.admin_update_pricing_tier(integer, text, numeric, integer) to authenticated;

drop policy if exists service_types_admin_read on public.service_types;
create policy service_types_admin_read
  on public.service_types for select to authenticated
  using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pro-verification-documents',
  'pro-verification-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pro_verification_documents_read on storage.objects;
create policy pro_verification_documents_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pro-verification-documents'
    and (split_part(name, '/', 1) = auth.uid()::text or public.is_admin())
  );

drop policy if exists pro_verification_documents_insert on storage.objects;
create policy pro_verification_documents_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pro-verification-documents'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.pro_profiles where user_id = auth.uid())
  );

drop policy if exists pro_verification_documents_update on storage.objects;
create policy pro_verification_documents_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'pro-verification-documents'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'pro-verification-documents'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists pro_verification_documents_delete on storage.objects;
create policy pro_verification_documents_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pro-verification-documents'
    and split_part(name, '/', 1) = auth.uid()::text
  );
