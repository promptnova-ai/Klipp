-- Catalog prices are professional-defined. A zero catalog value is the explicit
-- sentinel meaning there is no platform-wide fixed price for this modality.
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
as $function$
begin
  if not public.has_admin_permission('catalog.manage') then
    raise exception 'permission denied: catalog.manage';
  end if;
  if nullif(trim(p_label),'') is null or length(trim(p_label))>100 then
    raise exception 'pricing label must contain 1 to 100 characters';
  end if;
  if p_price_dop is null or p_price_dop < 0 or p_price_dop > 1000000 then
    raise exception 'catalog reference price must be zero or a non-negative DOP amount';
  end if;
  if p_est_minutes is null or p_est_minutes not between 15 and 1440 then
    raise exception 'duration must be between 15 and 1440 minutes';
  end if;
  update public.pricing_tiers
  set label=trim(p_label),price_dop=p_price_dop,est_minutes=p_est_minutes
  where id=p_tier_id;
  if not found then raise exception 'pricing tier not found'; end if;
  insert into public.admin_audit_log(actor_id,action,details)
  values(auth.uid(),'catalog.pricing_tier_updated',jsonb_build_object('pricing_tier_id',p_tier_id));
end;
$function$;
