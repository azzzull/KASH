-- ============================================================
-- Helper: get_cron_job_info()
-- Allows secure inspection of active cron job metadata without
-- exposing database internals.
-- ============================================================

create or replace function public.get_cron_job_info()
returns table (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  command text
)
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  return query
  select
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    j.command
  from cron.job j
  where j.jobname = 'kash-process-recurring-reminders';
end;
$$;
