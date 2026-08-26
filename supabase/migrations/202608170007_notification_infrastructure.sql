-- ============================================================
-- KASH BETA SPRINT 13: Notification Infrastructure Migration
-- Table: public.notifications
-- Features: Strict read state consistency, secure RPCs, 
--           internal creator helper, RLS, idempotent Realtime
-- ============================================================

-- 1. Create Notifications Table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint notifications_read_state_check check (
    (not is_read and read_at is null) or
    (is_read and read_at is not null)
  )
);

-- 2. Read State Trigger for Consistency
create or replace function public.handle_notification_read_state()
returns trigger
language plpgsql
as $$
begin
  if new.is_read = true and new.read_at is null then
    new.read_at := now();
  elsif new.is_read = false then
    new.read_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notification_read_state on public.notifications;
create trigger trg_notification_read_state
before insert or update on public.notifications
for each row
execute function public.handle_notification_read_state();

-- 3. Performance Indexes
create index if not exists notifications_user_created_at_idx
on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
on public.notifications (user_id, is_read)
where not is_read;

-- 4. Row Level Security (RLS)
alter table public.notifications enable row level security;

-- SELECT Policy
drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
on public.notifications
for select
using (auth.uid() = user_id);

-- DELETE Policy (Restricted to read notifications only)
drop policy if exists "Users can delete their own read notifications" on public.notifications;
create policy "Users can delete their own read notifications"
on public.notifications
for delete
using (auth.uid() = user_id and is_read = true);

-- UPDATE Policy (Restricted to own notifications)
drop policy if exists "Users can update their own notification read state" on public.notifications;
create policy "Users can update their own notification read state"
on public.notifications
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- NOTE: Direct client INSERT is intentionally NOT permitted.

-- 5. Secure Internal Helper Function (For trusted DB triggers / business RPCs)
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

-- Restrict execution permissions on internal helper
revoke execute on function public.create_notification(uuid, text, text, text, text, uuid, jsonb) from public, anon, authenticated;

-- 6. Dedicated Secure RPCs for Client Mutations
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set is_read = true, read_at = now()
  where id = p_notification_id and user_id = auth.uid();
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set is_read = true, read_at = now()
  where user_id = auth.uid() and is_read = false;
end;
$$;

create or replace function public.clear_read_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  delete from public.notifications
  where user_id = auth.uid() and is_read = true;
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

-- Grant EXECUTE on client mutation RPCs
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.clear_read_notifications() to authenticated;

-- 7. Idempotent Supabase Realtime Publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
