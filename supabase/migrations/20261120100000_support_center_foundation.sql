-- Klipp support center: customer cases, private conversation messages and knowledge base.
create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  category text not null check (category in ('booking', 'professional', 'payment', 'safety', 'other')),
  subject text not null,
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved')),
  handoff_requested boolean not null default false,
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_conversations_client_created_idx
  on public.support_conversations (client_id, created_at desc);
create index if not exists support_conversations_status_created_idx
  on public.support_conversations (status, created_at desc);

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_type text not null check (sender_type in ('client', 'admin', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at, id);

create table if not exists public.support_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content text not null,
  category text not null,
  published boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_knowledge_articles enable row level security;

drop policy if exists support_conversations_client_read on public.support_conversations;
create policy support_conversations_client_read on public.support_conversations
  for select to authenticated using (client_id = (select auth.uid()));

drop policy if exists support_conversations_client_create on public.support_conversations;
create policy support_conversations_client_create on public.support_conversations
  for insert to authenticated with check (
    client_id = (select auth.uid())
    and assigned_admin_id is null
    and status = 'open'
  );

drop policy if exists support_conversations_admin_read on public.support_conversations;
create policy support_conversations_admin_read on public.support_conversations
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

drop policy if exists support_conversations_admin_update on public.support_conversations;
create policy support_conversations_admin_update on public.support_conversations
  for update to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

drop policy if exists support_messages_participant_read on public.support_messages;
create policy support_messages_participant_read on public.support_messages
  for select to authenticated using (
    exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and (c.client_id = (select auth.uid())
          or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
    )
  );

drop policy if exists support_messages_client_create on public.support_messages;
create policy support_messages_client_create on public.support_messages
  for insert to authenticated with check (
    sender_type = 'client'
    and sender_id = (select auth.uid())
    and exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id
        and c.client_id = (select auth.uid())
        and c.status <> 'resolved'
    )
  );

drop policy if exists support_messages_admin_create on public.support_messages;
create policy support_messages_admin_create on public.support_messages
  for insert to authenticated with check (
    sender_type = 'admin'
    and sender_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
    and exists (select 1 from public.support_conversations c where c.id = support_messages.conversation_id)
  );

drop policy if exists support_knowledge_published_read on public.support_knowledge_articles;
create policy support_knowledge_published_read on public.support_knowledge_articles
  for select to authenticated using (
    published = true
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

drop policy if exists support_knowledge_admin_manage on public.support_knowledge_articles;
create policy support_knowledge_admin_manage on public.support_knowledge_articles
  for all to authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

grant select, insert on public.support_conversations to authenticated;
grant update on public.support_conversations to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select, insert, update, delete on public.support_knowledge_articles to authenticated;
grant usage, select on sequence public.support_messages_id_seq to authenticated;

alter table public.support_conversations replica identity full;
alter table public.support_messages replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_conversations') then
    alter publication supabase_realtime add table public.support_conversations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages') then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end;
$$;
