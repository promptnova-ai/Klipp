alter table public.booking_requests
  add column if not exists materials_confirmed_at timestamptz;

alter function public.respond_to_request(uuid, boolean)
  rename to respond_to_request_unchecked;

revoke all on function public.respond_to_request_unchecked(uuid, boolean)
  from public, anon, authenticated;

create or replace function public.respond_to_request(
  p_request_id uuid,
  p_accept boolean,
  p_materials_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_accept then
    if coalesce(p_materials_confirmed, false) is not true then
      raise exception 'materials confirmation required';
    end if;

    update public.booking_requests
    set materials_confirmed_at = now()
    where id = p_request_id
      and pro_id = auth.uid()
      and status = 'pending'
      and expires_at > now();

    if not found then
      raise exception 'request not found or expired';
    end if;
  end if;

  perform public.respond_to_request_unchecked(p_request_id, p_accept);
end;
$$;

revoke all on function public.respond_to_request(uuid, boolean, boolean)
  from public, anon;
grant execute on function public.respond_to_request(uuid, boolean, boolean)
  to authenticated;
