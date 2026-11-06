-- Remove SECURITY DEFINER semantics from the professional-card view.
-- Client UI reads the same fields through a booking-ownership-checked RPC.
alter view public.pro_cards set (security_invoker = true);

revoke all privileges on table public.pro_cards from public, anon, authenticated;
grant select on table public.pro_cards to service_role;

create or replace function public.get_client_booking_pro_cards(p_booking_ids uuid[])
returns table (
  pro_id uuid,
  full_name text,
  avatar_url text,
  bio text,
  years_experience integer,
  base_sector_id integer,
  rating_avg numeric,
  rating_count integer,
  jobs_completed integer,
  transport_type text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    pp.user_id as pro_id,
    pr.full_name,
    pr.avatar_url,
    pp.bio,
    pp.years_experience,
    pp.base_sector_id,
    pp.rating_avg,
    pp.rating_count,
    pp.jobs_completed,
    pp.transport_type
  from public.bookings b
  join public.pro_profiles pp on pp.user_id = b.pro_id
  join public.profiles pr on pr.id = pp.user_id
  where b.client_id = auth.uid()
    and b.id = any(coalesce(p_booking_ids, '{}'::uuid[]))
    and b.pro_id is not null;
$function$;

revoke all on function public.get_client_booking_pro_cards(uuid[]) from public, anon;
grant execute on function public.get_client_booking_pro_cards(uuid[]) to authenticated;

create or replace function public.is_approved_active_professional(p_pro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.pro_profiles pp
    where pp.user_id = p_pro_id
      and pp.active
      and pp.verification_status = 'approved'
  );
$function$;

revoke all on function public.is_approved_active_professional(uuid) from public, anon;
grant execute on function public.is_approved_active_professional(uuid) to authenticated;

drop policy if exists pro_portfolio_public_read on public.pro_portfolio;
create policy pro_portfolio_public_read
  on public.pro_portfolio for select
  to authenticated
  using (public.is_approved_active_professional(pro_id));
