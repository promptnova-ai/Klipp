-- In-app alerts for the platform owner when customer support needs attention.
-- Deliberately does not enqueue push delivery here: the current QA push trigger
-- points at the production Edge Function URL and must not be invoked from QA.

create or replace function public.notify_platform_owner_support_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  select owner_user_id into v_owner_id
  from public.platform_owner
  where singleton = true;

  if v_owner_id is null then
    return new;
  end if;

  insert into public.notifications (
    user_id, booking_id, type, title, body, data, show_in_app, dedupe_key
  ) values (
    v_owner_id,
    null,
    'support_case',
    'Nueva consulta en Klipp',
    'Un cliente ha abierto una consulta en el Centro de ayuda.',
    jsonb_build_object('conversation_id', new.id, 'category', new.category),
    true,
    'support-case:' || new.id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.notify_platform_owner_support_case() from public, anon, authenticated;

drop trigger if exists support_case_notify_platform_owner on public.support_conversations;
create trigger support_case_notify_platform_owner
  after insert on public.support_conversations
  for each row execute function public.notify_platform_owner_support_case();

create or replace function public.notify_platform_owner_support_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_case public.support_conversations%rowtype;
begin
  if new.sender_type <> 'client' then
    return new;
  end if;

  select * into v_case
  from public.support_conversations
  where id = new.conversation_id;

  if not found or (v_case.status <> 'in_review' and not v_case.handoff_requested) then
    return new;
  end if;

  select owner_user_id into v_owner_id
  from public.platform_owner
  where singleton = true;

  if v_owner_id is null then
    return new;
  end if;

  insert into public.notifications (
    user_id, booking_id, type, title, body, data, show_in_app, dedupe_key
  ) values (
    v_owner_id,
    null,
    'support_message',
    'Nuevo mensaje en una reclamación',
    'Un cliente ha añadido información a un caso que requiere atención.',
    jsonb_build_object('conversation_id', new.conversation_id),
    true,
    'support-message:' || new.id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function public.notify_platform_owner_support_message() from public, anon, authenticated;

drop trigger if exists support_message_notify_platform_owner on public.support_messages;
create trigger support_message_notify_platform_owner
  after insert on public.support_messages
  for each row execute function public.notify_platform_owner_support_message();
