create table if not exists public.conversations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

revoke all on public.conversations from anon;
grant select, insert, update, delete on public.conversations to authenticated;

create policy "Users can read their own conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own conversations"
  on public.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own conversations"
  on public.conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.messages (
  id uuid primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb,
  attachment_name text,
  attachment_path text,
  created_at timestamptz not null,
  unique (conversation_id, id)
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at, id);

alter table public.messages enable row level security;

revoke all on public.messages from anon;
grant select, insert, update, delete on public.messages to authenticated;

create policy "Users can read messages in their conversations"
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  ));

create policy "Users can create messages in their conversations"
  on public.messages for insert to authenticated
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  ));

create policy "Users can update messages in their conversations"
  on public.messages for update to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  ));

create policy "Users can delete messages in their conversations"
  on public.messages for delete to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  ));

create or replace function public.save_conversation(
  p_conversation_id uuid,
  p_title text,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_messages jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages) > 100 then
    raise exception 'Invalid conversation messages';
  end if;

  insert into public.conversations (id, user_id, title, created_at, updated_at)
  values (p_conversation_id, current_user_id, p_title, p_created_at, p_updated_at)
  on conflict (id) do update
    set title = excluded.title, updated_at = excluded.updated_at
    where public.conversations.user_id = current_user_id;

  if not found then
    raise exception 'Conversation is not owned by the current user';
  end if;

  delete from public.messages where conversation_id = p_conversation_id;

  insert into public.messages (id, conversation_id, role, content, metadata, attachment_name, attachment_path, created_at)
  select
    (message ->> 'id')::uuid,
    p_conversation_id,
    message ->> 'role',
    message ->> 'content',
    message -> 'metadata',
    message ->> 'attachmentName',
    message ->> 'attachmentPath',
    (message ->> 'createdAt')::timestamptz
  from jsonb_array_elements(p_messages) as items(message);

  update public.conversations set updated_at = p_updated_at where id = p_conversation_id;
end;
$$;

revoke all on function public.save_conversation(uuid, text, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.save_conversation(uuid, text, timestamptz, timestamptz, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conversation-images', 'conversation-images', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their own conversation images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'conversation-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can upload their own conversation images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'conversation-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can update their own conversation images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'conversation-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'conversation-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own conversation images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'conversation-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
