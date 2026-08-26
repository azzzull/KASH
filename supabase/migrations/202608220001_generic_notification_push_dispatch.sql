-- ============================================================
-- KASH: Generic In-App Notification -> Web Push Dispatch
--
-- Fixes notification types that create public.notifications rows but
-- never invoke Web Push. The notifications row is now the canonical
-- source of push dispatch for all user-facing notifications.
-- ============================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'delivered', 'failed', 'no_devices', 'skipped')),
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  devices_targeted int not null default 0,
  devices_delivered int not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.notification_push_deliveries enable row level security;

drop policy if exists "Users can view their own push deliveries" on public.notification_push_deliveries;
create policy "Users can view their own push deliveries"
on public.notification_push_deliveries for select
using (user_id = auth.uid());

create or replace function public.setup_kash_push_vault_secret(
  p_push_secret text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  if p_push_secret is null or length(trim(p_push_secret)) = 0 then
    raise exception 'Missing KASH push internal secret.';
  end if;

  if exists (select 1 from vault.secrets where name = 'kash_push_internal_secret') then
    select id into v_secret_id from vault.secrets where name = 'kash_push_internal_secret' limit 1;
    perform vault.update_secret(v_secret_id, p_push_secret, 'kash_push_internal_secret', 'KASH internal push secret');
  else
    perform vault.create_secret(p_push_secret, 'kash_push_internal_secret', 'KASH internal push secret');
  end if;
end;
$$;

create or replace function public.dispatch_notification_push_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions, net
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'kash_project_url'
  order by created_at desc
  limit 1;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'kash_push_internal_secret'
  order by created_at desc
  limit 1;

  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-kash-push-secret', v_secret
    ),
    body := jsonb_build_object(
      'notification_id', new.id
    )
  );

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists trigger_dispatch_notification_push on public.notifications;
create trigger trigger_dispatch_notification_push
after insert on public.notifications
for each row
execute function public.dispatch_notification_push_trigger();
