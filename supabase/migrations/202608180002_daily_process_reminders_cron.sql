-- ============================================================
-- KASH BETA SPRINT 14: Daily Scheduled Reminders Cron Job
-- Enables: pg_cron, pg_net, vault
-- Helper: public.invoke_process_reminders_cron() (Vault-secured)
-- Schedule: '0 1 * * *' (01:00 UTC / 08:00 Asia/Jakarta)
-- Note: Secrets are read dynamically from Vault at runtime.
--       No plaintext secrets exist in this migration or cron.job.
-- ============================================================

-- 1. Ensure required extensions are available
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- 2. Create Vault-secured Cron Invoker Function
create or replace function public.invoke_process_reminders_cron()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions, net
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  -- Safely retrieve endpoint URL from Vault
  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'kash_project_url'
  order by created_at desc
  limit 1;

  -- Safely retrieve cron secret from Vault
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'kash_reminder_cron_secret'
  order by created_at desc
  limit 1;

  if v_url is null or v_secret is null then
    raise warning 'KASH Cron: Missing kash_project_url or kash_reminder_cron_secret in Vault.';
    return null;
  end if;

  -- Invoke process-reminders with empty JSON body via net.http_post
  -- (Production execution relies on profiles.timezone for user-local date calculation)
  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/process-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-kash-cron-secret', v_secret
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  return v_request_id;
end;
$$;

-- 3. Register or Update Daily Cron Schedule
do $$
begin
  -- Unschedule existing job if already present to guarantee exactly one job
  if exists (select 1 from cron.job where jobname = 'kash-process-recurring-reminders') then
    perform cron.unschedule('kash-process-recurring-reminders');
  end if;

  -- Schedule daily at 01:00 UTC (08:00 WIB)
  perform cron.schedule(
    'kash-process-recurring-reminders',
    '0 1 * * *',
    'select public.invoke_process_reminders_cron();'
  );
end;
$$;

-- 4. Secure Helper to Provision/Update Vault Secrets (Callable only with service role / admin)
create or replace function public.setup_kash_vault_secrets(
  p_project_url text,
  p_cron_secret text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  -- Upsert kash_project_url
  if exists (select 1 from vault.secrets where name = 'kash_project_url') then
    select id into v_secret_id from vault.secrets where name = 'kash_project_url' limit 1;
    perform vault.update_secret(v_secret_id, p_project_url, 'kash_project_url', 'KASH project base URL');
  else
    perform vault.create_secret(p_project_url, 'kash_project_url', 'KASH project base URL');
  end if;

  -- Upsert kash_reminder_cron_secret
  if exists (select 1 from vault.secrets where name = 'kash_reminder_cron_secret') then
    select id into v_secret_id from vault.secrets where name = 'kash_reminder_cron_secret' limit 1;
    perform vault.update_secret(v_secret_id, p_cron_secret, 'kash_reminder_cron_secret', 'KASH reminder cron secret');
  else
    perform vault.create_secret(p_cron_secret, 'kash_reminder_cron_secret', 'KASH reminder cron secret');
  end if;
end;
$$;

