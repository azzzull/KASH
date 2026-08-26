-- ============================================================
-- Helper: get_cron_run_history()
-- Inspects recent pg_cron execution history from cron.job_run_details
-- ============================================================

create or replace function public.get_cron_run_history()
returns table (
  runid bigint,
  jobid bigint,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  return query
  select
    d.runid,
    d.jobid,
    d.status,
    d.return_message,
    d.start_time,
    d.end_time
  from cron.job_run_details d
  where d.jobid in (select j.jobid from cron.job j where j.jobname = 'kash-process-recurring-reminders')
  order by d.start_time desc
  limit 10;
end;
$$;
