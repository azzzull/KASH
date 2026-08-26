-- ============================================================
-- KASH: Harden Generic Notification -> Web Push Dispatch
--
-- Keeps public.notifications as the canonical user-facing source
-- for Web Push and adds a service-role recovery helper for rows
-- created before/while the dispatcher was unavailable.
-- ============================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.setup_kash_notification_push_dispatch(
  p_project_url text,
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
  if p_project_url is null or length(trim(p_project_url)) = 0 then
    raise exception 'Missing KASH project URL.';
  end if;

  if p_push_secret is null or length(trim(p_push_secret)) = 0 then
    raise exception 'Missing KASH push internal secret.';
  end if;

  if exists (select 1 from vault.secrets where name = 'kash_project_url') then
    select id into v_secret_id from vault.secrets where name = 'kash_project_url' limit 1;
    perform vault.update_secret(v_secret_id, p_project_url, 'kash_project_url', 'KASH project base URL');
  else
    perform vault.create_secret(p_project_url, 'kash_project_url', 'KASH project base URL');
  end if;

  if exists (select 1 from vault.secrets where name = 'kash_push_internal_secret') then
    select id into v_secret_id from vault.secrets where name = 'kash_push_internal_secret' limit 1;
    perform vault.update_secret(v_secret_id, p_push_secret, 'kash_push_internal_secret', 'KASH internal push secret');
  else
    perform vault.create_secret(p_push_secret, 'kash_push_internal_secret', 'KASH internal push secret');
  end if;
end;
$$;

revoke execute on function public.setup_kash_notification_push_dispatch(text, text) from public, anon, authenticated;
grant execute on function public.setup_kash_notification_push_dispatch(text, text) to service_role;

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
    raise warning 'KASH Push: Missing kash_project_url or kash_push_internal_secret in Vault.';
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
    raise warning 'KASH Push: notification dispatch failed for notification %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trigger_dispatch_notification_push on public.notifications;
create trigger trigger_dispatch_notification_push
after insert on public.notifications
for each row
execute function public.dispatch_notification_push_trigger();

create or replace function public.dispatch_pending_notification_pushes(
  p_limit integer default 100
)
returns table (
  notification_id uuid,
  request_id bigint
)
language plpgsql
security definer
set search_path = public, vault, extensions, net
as $$
declare
  v_url text;
  v_secret text;
  v_rec record;
  v_request_id bigint;
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
    raise exception 'Missing kash_project_url or kash_push_internal_secret in Vault.';
  end if;

  for v_rec in
    select n.id
    from public.notifications n
    left join public.notification_push_deliveries d
      on d.notification_id = n.id
    where d.notification_id is null
    order by n.created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    select net.http_post(
      url := rtrim(v_url, '/') || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-kash-push-secret', v_secret
      ),
      body := jsonb_build_object(
        'notification_id', v_rec.id
      )
    ) into v_request_id;

    notification_id := v_rec.id;
    request_id := v_request_id;
    return next;
  end loop;
end;
$$;

revoke execute on function public.dispatch_pending_notification_pushes(integer) from public, anon, authenticated;
grant execute on function public.dispatch_pending_notification_pushes(integer) to service_role;
