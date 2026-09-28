-- Daily Money Check-in V1
-- This migration intentionally stores behavioural review metadata separately
-- from the financial ledger. No transaction, balance, budget, or report
-- calculation is created or altered by a check-in.

alter table public.profiles
  add column if not exists daily_checkin_enabled boolean not null default false,
  add column if not exists daily_checkin_time time not null default '20:30',
  add column if not exists daily_checkin_timezone text not null default 'UTC',
  add column if not exists daily_checkin_intro_seen boolean not null default false;

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_date date not null,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'no_spending')),
  reviewed_at timestamptz null,
  snoozed_until timestamptz null,
  last_reminded_at timestamptz null,
  reminders_sent_count smallint not null default 0 check (reminders_sent_count between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_checkins_user_review_date_key unique (user_id, review_date),
  constraint daily_checkins_completion_state_check check (
    (status = 'pending' and reviewed_at is null)
    or (status in ('reviewed', 'no_spending') and reviewed_at is not null)
  )
);

create index if not exists daily_checkins_user_recent_idx
  on public.daily_checkins (user_id, review_date desc);

alter table public.daily_checkins enable row level security;

drop policy if exists "Users can view own daily check-ins" on public.daily_checkins;
create policy "Users can view own daily check-ins"
  on public.daily_checkins for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily check-ins" on public.daily_checkins;
create policy "Users can insert own daily check-ins"
  on public.daily_checkins for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily check-ins" on public.daily_checkins;
create policy "Users can update own daily check-ins"
  on public.daily_checkins for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists daily_checkins_set_updated_at on public.daily_checkins;
create trigger daily_checkins_set_updated_at
before update on public.daily_checkins
for each row execute function public.set_updated_at();

create or replace function public.complete_daily_checkin(
  p_review_date date,
  p_status text
)
returns public.daily_checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_today date;
  v_result public.daily_checkins;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_status not in ('reviewed', 'no_spending') then
    raise exception 'Invalid daily check-in status';
  end if;

  select coalesce(nullif(daily_checkin_timezone, ''), nullif(timezone, ''), 'UTC')
    into v_timezone
  from public.profiles
  where id = v_user_id;

  v_today := (now() at time zone v_timezone)::date;
  if p_review_date > v_today then
    raise exception 'A future day cannot be reviewed';
  end if;

  insert into public.daily_checkins (
    user_id, review_date, status, reviewed_at, snoozed_until
  ) values (
    v_user_id, p_review_date, p_status, now(), null
  ) on conflict (user_id, review_date) do update
    set status = excluded.status,
        reviewed_at = excluded.reviewed_at,
        snoozed_until = null
  returning * into v_result;

  update public.notifications
  set is_read = true, read_at = now()
  where user_id = v_user_id
    and entity_type = 'daily_checkin'
    and coalesce(metadata ->> 'review_date', '') = p_review_date::text
    and is_read = false;

  return v_result;
end;
$$;

grant execute on function public.complete_daily_checkin(date, text) to authenticated;

create or replace function public.snooze_daily_checkin(
  p_review_date date,
  p_minutes integer default 60
)
returns public.daily_checkins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.daily_checkins;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_minutes < 15 or p_minutes > 240 then
    raise exception 'Invalid snooze interval';
  end if;

  insert into public.daily_checkins (user_id, review_date, status, snoozed_until)
  values (v_user_id, p_review_date, 'pending', now() + make_interval(mins => p_minutes))
  on conflict (user_id, review_date) do update
    set snoozed_until = case
      when public.daily_checkins.status = 'pending' then now() + make_interval(mins => p_minutes)
      else public.daily_checkins.snoozed_until
    end
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.snooze_daily_checkin(date, integer) to authenticated;

-- The database owns Personal Space scoping and eligible-spending semantics.
-- It uses the same completed-expense definition as the existing dashboard and
-- spending-breakdown implementation, while excluding non-consumption ledger
-- events linked to another financial domain.
create or replace function public.get_daily_checkin_summary(p_review_date date)
returns table (
  transaction_id uuid,
  title text,
  amount numeric,
  transaction_date timestamptz,
  category_name text,
  category_icon text,
  category_color text,
  currency char(3),
  transaction_count integer,
  total_expense numeric,
  review_status text,
  reviewed_at timestamptz,
  snoozed_until timestamptz
)
language sql
security definer
set search_path = public
as $$
  with current_user_profile as (
    select p.id,
      coalesce(nullif(p.daily_checkin_timezone, ''), nullif(p.timezone, ''), 'UTC') as tz,
      p.default_currency
    from public.profiles p
    where p.id = auth.uid()
  ),
  personal_space as (
    select s.id
    from public.financial_spaces s
    join current_user_profile p on p.id = s.owner_user_id
    where s.space_type = 'personal'
    limit 1
  ),
  eligible as (
    select t.*
    from public.transactions t
    join current_user_profile p on p.id = t.user_id
    join personal_space s on s.id = t.space_id
    where t.status = 'completed'
      and t.type = 'expense'
      and t.related_entity_type is null
      and (t.transaction_date at time zone p.tz)::date = p_review_date
  ),
  totals as (
    select count(*)::integer as count, coalesce(sum(amount), 0)::numeric as total
    from eligible
  ),
  review as (
    select d.status, d.reviewed_at, d.snoozed_until
    from public.daily_checkins d
    where d.user_id = auth.uid() and d.review_date = p_review_date
  )
  select
    e.id,
    coalesce(nullif(e.title, ''), nullif(e.note, ''), 'Transaction'),
    e.amount,
    e.transaction_date,
    c.name,
    c.icon,
    c.color,
    p.default_currency,
    totals.count,
    totals.total,
    review.status,
    review.reviewed_at,
    review.snoozed_until
  from current_user_profile p
  cross join totals
  left join eligible e on true
  left join public.categories c on c.id = e.category_id
  left join review on true
  order by e.transaction_date desc nulls last;
$$;

grant execute on function public.get_daily_checkin_summary(date) to authenticated;

create or replace function public.invalidate_daily_checkin_date(
  p_user_id uuid,
  p_space_id uuid,
  p_transaction_date timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timezone text;
  v_review_date date;
begin
  if p_user_id is null or p_space_id is null or p_transaction_date is null then
    return;
  end if;

  if not exists (
    select 1
    from public.financial_spaces s
    where s.id = p_space_id
      and s.owner_user_id = p_user_id
      and s.space_type = 'personal'
  ) then
    return;
  end if;

  select coalesce(nullif(daily_checkin_timezone, ''), nullif(timezone, ''), 'UTC')
    into v_timezone
  from public.profiles
  where id = p_user_id;

  v_review_date := (p_transaction_date at time zone v_timezone)::date;
  update public.daily_checkins
  set status = 'pending', reviewed_at = null, snoozed_until = null
  where user_id = p_user_id
    and review_date = v_review_date
    and status in ('reviewed', 'no_spending');
end;
$$;

create or replace function public.invalidate_daily_checkin_after_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type = 'expense' and new.status = 'completed' and new.related_entity_type is null then
      perform public.invalidate_daily_checkin_date(new.user_id, new.space_id, new.transaction_date);
    end if;
    return new;
  end if;

  if old.type = 'expense' and old.status = 'completed' and old.related_entity_type is null then
    perform public.invalidate_daily_checkin_date(old.user_id, old.space_id, old.transaction_date);
  end if;
  if new.type = 'expense' and new.status = 'completed' and new.related_entity_type is null then
    perform public.invalidate_daily_checkin_date(new.user_id, new.space_id, new.transaction_date);
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_invalidate_daily_checkin on public.transactions;
create trigger transactions_invalidate_daily_checkin
after insert or update of type, status, related_entity_type, transaction_date, amount, category_id, envelope_id, wallet_id, space_id
on public.transactions
for each row execute function public.invalidate_daily_checkin_after_transaction_change();

-- Called by the existing trusted Edge Function. An initial reminder and one
-- snoozed reminder are each idempotent by notification source key.
create or replace function public.process_daily_checkin_reminders(p_now timestamptz default now())
returns table (
  notification_id uuid,
  user_id uuid,
  title text,
  message text,
  target_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_checkin public.daily_checkins;
  v_local_now timestamp;
  v_review_date date;
  v_kind text;
  v_source_key text;
  v_notification_id uuid;
begin
  for v_profile in
    select id,
      coalesce(nullif(daily_checkin_timezone, ''), nullif(timezone, ''), 'UTC') as tz,
      daily_checkin_time
    from public.profiles
    where daily_checkin_enabled = true
  loop
    v_local_now := p_now at time zone v_profile.tz;
    v_review_date := v_local_now::date;

    select * into v_checkin
    from public.daily_checkins
    where user_id = v_profile.id and review_date = v_review_date;

    if found and v_checkin.status in ('reviewed', 'no_spending') then
      continue;
    end if;

    if found and v_checkin.snoozed_until is not null
      and v_checkin.snoozed_until <= p_now
      and v_checkin.reminders_sent_count = 1 then
      v_kind := 'snooze';
    elsif (not found or v_checkin.reminders_sent_count = 0)
      and v_local_now::time >= v_profile.daily_checkin_time
      and v_local_now::time < v_profile.daily_checkin_time + interval '10 minutes' then
      v_kind := 'initial';
    else
      continue;
    end if;

    v_source_key := format('daily-checkin:%s:%s:%s', v_profile.id, v_review_date, v_kind);
    insert into public.notifications (
      user_id, type, title, message, entity_type, metadata, source_key
    ) values (
      v_profile.id,
      'daily_checkin_reminder',
      'Sudah catat semua transaksi hari ini?',
      'Cek sebentar supaya catatan KASH kamu tetap lengkap.',
      'daily_checkin',
      jsonb_build_object('review_date', v_review_date, 'target_path', '/daily-review?date=' || v_review_date),
      v_source_key
    ) on conflict (source_key) where source_key is not null do nothing
    returning id into v_notification_id;

    if v_notification_id is null then
      continue;
    end if;

    insert into public.daily_checkins (
      user_id, review_date, status, last_reminded_at, reminders_sent_count, snoozed_until
    ) values (
      v_profile.id, v_review_date, 'pending', p_now, 1, null
    ) on conflict (user_id, review_date) do update
      set last_reminded_at = p_now,
          reminders_sent_count = public.daily_checkins.reminders_sent_count + 1,
          snoozed_until = null;

    notification_id := v_notification_id;
    user_id := v_profile.id;
    title := 'Sudah catat semua transaksi hari ini?';
    message := 'Cek sebentar supaya catatan KASH kamu tetap lengkap.';
    target_path := '/daily-review?date=' || v_review_date;
    return next;
  end loop;
end;
$$;

-- The existing job already invokes the shared Edge Function. A ten-minute
-- cadence evaluates only due users; it is not a per-user timer.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'kash-process-recurring-reminders') then
    perform cron.unschedule('kash-process-recurring-reminders');
  end if;
  perform cron.schedule(
    'kash-process-recurring-reminders',
    '*/10 * * * *',
    'select public.invoke_process_reminders_cron();'
  );
end;
$$;
