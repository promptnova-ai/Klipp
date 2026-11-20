-- Support AI retrieval, resolution metadata and auditable admin actions.
alter table public.support_knowledge_articles
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('spanish'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('spanish'::regconfig, coalesce(content, '')), 'B')
  ) stored;

create index if not exists support_knowledge_articles_search_idx
  on public.support_knowledge_articles using gin (search_vector);

create index if not exists support_conversations_status_updated_idx
  on public.support_conversations (status, updated_at desc);

alter table public.support_conversations
  add column if not exists resolution_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_conversations_resolution_required'
      and conrelid = 'public.support_conversations'::regclass
  ) then
    alter table public.support_conversations
      add constraint support_conversations_resolution_required
      check (status <> 'resolved' or nullif(btrim(resolution_note), '') is not null);
  end if;
end;
$$;

create or replace function public.audit_support_conversation_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.admin_audit_log (actor_id, action, target_id, details)
    values (
      auth.uid(),
      'support.case_created',
      new.id,
      jsonb_build_object(
        'category', new.category,
        'booking_linked', new.booking_id is not null
      )
    );
  elsif old.status is distinct from new.status
     or old.assigned_admin_id is distinct from new.assigned_admin_id
     or old.handoff_requested is distinct from new.handoff_requested then
    insert into public.admin_audit_log (actor_id, action, target_id, details)
    values (
      auth.uid(),
      'support.case_updated',
      new.id,
      jsonb_build_object(
        'from_status', old.status,
        'to_status', new.status,
        'assigned', new.assigned_admin_id is not null,
        'handoff_requested', new.handoff_requested
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_support_conversation_changes() from public, anon, authenticated;

drop trigger if exists support_conversation_audit on public.support_conversations;
create trigger support_conversation_audit
  after insert or update on public.support_conversations
  for each row execute function public.audit_support_conversation_changes();

create or replace function public.audit_support_admin_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_type = 'admin' and auth.uid() is not null then
    insert into public.admin_audit_log (actor_id, action, target_id, details)
    values (
      auth.uid(),
      'support.admin_reply_sent',
      new.conversation_id,
      jsonb_build_object('message_id', new.id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_support_admin_message() from public, anon, authenticated;

drop trigger if exists support_admin_message_audit on public.support_messages;
create trigger support_admin_message_audit
  after insert on public.support_messages
  for each row execute function public.audit_support_admin_message();
