-- Mobile reminder timing and contextual expense accounting.
-- This migration keeps cash movements in the transaction ledger and represents
-- reimbursement rights as ordinary receivables. It must be applied through the
-- normal Supabase migration workflow; it is not deployed by the frontend.

alter table public.recurring_obligations
  add column if not exists reminder_time time not null default '08:00';

alter table public.transactions
  add column if not exists expense_context text not null default 'personal';

alter table public.transactions
  drop constraint if exists transactions_expense_context_valid;

alter table public.transactions
  add constraint transactions_expense_context_valid
  check (expense_context in ('personal', 'work', 'reimbursable'));

create index if not exists transactions_space_expense_context_date_idx
  on public.transactions (space_id, expense_context, transaction_date desc)
  where type = 'expense' and status = 'completed';

create table if not exists public.expense_reimbursement_claims (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  debt_id uuid not null unique references public.debts(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid not null references public.financial_spaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_reimbursement_claims_user_space_idx
  on public.expense_reimbursement_claims (user_id, space_id);

alter table public.expense_reimbursement_claims enable row level security;

drop policy if exists "Users can view their reimbursement claims" on public.expense_reimbursement_claims;
create policy "Users can view their reimbursement claims"
  on public.expense_reimbursement_claims for select
  using (
    user_id = auth.uid()
    or public.user_has_managed_space_role(
      space_id,
      array['owner', 'admin', 'member']::public.managed_space_role[]
    )
  );

drop trigger if exists expense_reimbursement_claims_set_updated_at on public.expense_reimbursement_claims;
create trigger expense_reimbursement_claims_set_updated_at
before update on public.expense_reimbursement_claims
for each row execute function public.set_updated_at();

-- A contextual expense has implications outside a single transaction row.
-- Direct writes remain allowed for ordinary personal expenses, while this
-- trigger ensures work/reimbursable changes use the atomic RPC below.
create or replace function public.enforce_contextual_expense_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('kash.contextual_expense_write', true) = 'on' then
    return new;
  end if;

  if new.type = 'expense' and coalesce(new.expense_context, 'personal') <> 'personal' then
    raise exception 'Work and reimbursable expenses must be saved through record_contextual_expense';
  end if;

  if tg_op = 'UPDATE'
    and old.type = 'expense'
    and coalesce(old.expense_context, 'personal') <> 'personal' then
    raise exception 'Contextual expenses must be updated through record_contextual_expense';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_enforce_contextual_expense_write on public.transactions;
create trigger transactions_enforce_contextual_expense_write
before insert or update on public.transactions
for each row execute function public.enforce_contextual_expense_write();

create or replace function public.record_contextual_expense(
  p_amount numeric,
  p_category_id uuid,
  p_context text,
  p_counterparty_name text,
  p_envelope_id uuid,
  p_note text,
  p_space_id uuid,
  p_title text,
  p_transaction_date timestamptz,
  p_transaction_id uuid,
  p_wallet_id uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space public.financial_spaces%rowtype;
  v_transaction public.transactions%rowtype;
  v_claim public.expense_reimbursement_claims%rowtype;
  v_debt public.debts%rowtype;
  v_counterparty_id uuid;
  v_has_allocations boolean;
  v_context text := coalesce(nullif(trim(p_context), ''), 'personal');
  v_counterparty_name text := nullif(trim(coalesce(p_counterparty_name, '')), '');
  v_can_edit boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_context not in ('personal', 'work', 'reimbursable') then
    raise exception 'Invalid expense context';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero';
  end if;
  if p_category_id is null or p_wallet_id is null or p_space_id is null then
    raise exception 'Wallet, category, and space are required';
  end if;

  select * into v_space
  from public.financial_spaces
  where id = p_space_id and is_archived = false;
  if not found then
    raise exception 'Financial space not found or archived';
  end if;

  if v_space.space_type = 'personal' then
    v_can_edit := v_space.owner_user_id = v_user_id;
  else
    v_can_edit := public.user_has_managed_space_role(
      p_space_id,
      array['owner', 'admin', 'member']::public.managed_space_role[]
    );
  end if;
  if not v_can_edit then
    raise exception 'You do not have access to this financial space';
  end if;

  if not exists (
    select 1 from public.wallets w
    where w.id = p_wallet_id and w.space_id = p_space_id and w.is_archived = false
  ) then
    raise exception 'Selected wallet is not active in this financial space';
  end if;

  if not exists (
    select 1 from public.categories c
    where c.id = p_category_id
      and c.category_type = 'expense'
      and c.is_archived = false
      and (c.is_system = true or c.space_id = p_space_id)
  ) then
    raise exception 'Selected category is not an active expense category in this financial space';
  end if;

  if p_envelope_id is not null and not exists (
    select 1 from public.envelopes e
    where e.id = p_envelope_id and e.space_id = p_space_id
  ) then
    raise exception 'Selected envelope does not belong to this financial space';
  end if;

  if p_transaction_id is not null then
    select * into v_transaction
    from public.transactions
    where id = p_transaction_id and space_id = p_space_id
    for update;
    if not found or v_transaction.type <> 'expense' or v_transaction.transaction_subtype = 'external_transfer' then
      raise exception 'Expense transaction not found';
    end if;
    if v_space.space_type = 'personal' and v_transaction.user_id <> v_user_id then
      raise exception 'You cannot edit this transaction';
    end if;
    if v_space.space_type = 'managed'
      and public.user_has_managed_space_role(p_space_id, array['member']::public.managed_space_role[])
      and coalesce(v_transaction.created_by_user_id, v_transaction.user_id) <> v_user_id then
      raise exception 'You cannot edit this transaction';
    end if;
  end if;

  perform set_config('kash.contextual_expense_write', 'on', true);

  if p_transaction_id is null then
    insert into public.transactions (
      user_id, space_id, type, amount, wallet_id, category_id, envelope_id,
      transaction_date, title, note, status, expense_context
    ) values (
      v_user_id, p_space_id, 'expense', p_amount, p_wallet_id, p_category_id, p_envelope_id,
      coalesce(p_transaction_date, now()), nullif(trim(coalesce(p_title, '')), ''), p_note, 'completed', v_context
    ) returning * into v_transaction;
  else
    update public.transactions
    set amount = p_amount,
        wallet_id = p_wallet_id,
        category_id = p_category_id,
        envelope_id = p_envelope_id,
        transaction_date = coalesce(p_transaction_date, transaction_date),
        title = nullif(trim(coalesce(p_title, '')), ''),
        note = p_note,
        expense_context = v_context,
        related_entity_type = case when v_context = 'reimbursable' then 'reimbursable_expense' else null end,
        related_entity_id = case when v_context = 'reimbursable' then related_entity_id else null end
    where id = v_transaction.id
    returning * into v_transaction;
  end if;

  select * into v_claim
  from public.expense_reimbursement_claims
  where transaction_id = v_transaction.id
  for update;

  if found then
    select * into v_debt from public.debts where id = v_claim.debt_id for update;
    select exists (
      select 1 from public.debt_payment_allocations where debt_id = v_claim.debt_id
    ) into v_has_allocations;
  else
    v_has_allocations := false;
  end if;

  if v_context <> 'reimbursable' then
    if v_claim.transaction_id is not null then
      if v_has_allocations then
        raise exception 'A reimbursable expense with recorded repayments cannot be reclassified';
      end if;
      delete from public.expense_reimbursement_claims where transaction_id = v_transaction.id;
      delete from public.debts where id = v_claim.debt_id;
    end if;

    update public.transactions
    set related_entity_type = null, related_entity_id = null
    where id = v_transaction.id
    returning * into v_transaction;
    return v_transaction;
  end if;

  if v_claim.transaction_id is null and v_counterparty_name is null then
    raise exception 'A reimbursement counterparty is required';
  end if;

  if v_claim.transaction_id is not null and v_has_allocations and v_debt.original_amount <> p_amount then
    raise exception 'A reimbursable expense with recorded repayments cannot change amount';
  end if;

  if v_counterparty_name is not null then
    select c.id into v_counterparty_id
    from public.counterparties c
    where c.user_id = v_user_id
      and c.space_id = p_space_id
      and c.linked_space_id is null
      and lower(trim(c.name)) = lower(v_counterparty_name)
    limit 1;

    if v_counterparty_id is null then
      insert into public.counterparties (user_id, space_id, name)
      values (v_user_id, p_space_id, v_counterparty_name)
      returning id into v_counterparty_id;
    end if;
  end if;

  if v_claim.transaction_id is null then
    insert into public.debts (
      user_id, space_id, counterparty_id, type, original_amount, due_date,
      title, note, category_id, status
    ) values (
      v_user_id, p_space_id, v_counterparty_id, 'receivable', p_amount, null,
      coalesce(nullif(trim(coalesce(p_title, '')), ''), 'Reimbursable expense'), p_note,
      p_category_id, 'active'
    ) returning * into v_debt;

    insert into public.expense_reimbursement_claims (transaction_id, debt_id, user_id, space_id)
    values (v_transaction.id, v_debt.id, v_user_id, p_space_id);
  elsif not v_has_allocations then
    update public.debts
    set counterparty_id = coalesce(v_counterparty_id, counterparty_id),
        original_amount = p_amount,
        title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
        note = p_note,
        category_id = p_category_id
    where id = v_debt.id
    returning * into v_debt;
  end if;

  update public.transactions
  set related_entity_type = 'reimbursable_expense', related_entity_id = v_debt.id
  where id = v_transaction.id
  returning * into v_transaction;

  return v_transaction;
end;
$$;

revoke all on function public.record_contextual_expense(numeric, uuid, text, text, uuid, text, uuid, text, timestamptz, uuid, uuid) from public;
grant execute on function public.record_contextual_expense(numeric, uuid, text, text, uuid, text, uuid, text, timestamptz, uuid, uuid) to authenticated;

-- Recurring reminders are evaluated against each user's local wall-clock
-- reminder time. The cron job runs frequently, while deduplication remains in
-- notification_reminder_logs.
create or replace function public.process_recurring_reminders(
  p_current_date date default null
)
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
  v_payment record;
  v_offset integer;
  v_days_diff integer;
  v_notif_type text;
  v_title text;
  v_message text;
  v_target_path text;
  v_notif_id uuid;
  v_user_today date;
  v_local_now timestamp;
begin
  for v_payment in
    select p.id as payment_id, p.user_id, p.due_date, p.amount, p.installment_number,
      o.id as obligation_id, o.name as obligation_name, o.type as obligation_type,
      o.reminder_offsets, o.overdue_reminder_enabled, o.reminder_time,
      coalesce(prof.timezone, 'Asia/Jakarta') as user_timezone
    from public.recurring_payments p
    join public.recurring_obligations o on o.id = p.obligation_id
    join public.profiles prof on prof.id = p.user_id
    where o.status = 'active' and p.status in ('pending', 'overdue')
  loop
    v_local_now := now() at time zone v_payment.user_timezone;
    v_user_today := coalesce(p_current_date, v_local_now::date);
    if p_current_date is null
      and (v_local_now::time < v_payment.reminder_time
        or v_local_now::time >= v_payment.reminder_time + interval '10 minutes') then
      continue;
    end if;
    v_days_diff := v_payment.due_date - v_user_today;

    foreach v_offset in array v_payment.reminder_offsets loop
      if v_days_diff <> v_offset then continue; end if;
      begin
        insert into public.notification_reminder_logs (user_id, obligation_id, payment_id, reminder_offset, due_date)
        values (v_payment.user_id, v_payment.obligation_id, v_payment.payment_id, v_offset, v_payment.due_date);

        if v_offset = 0 then
          v_notif_type := case when v_payment.obligation_type in ('paylater', 'installment') then 'installment_due_today' else 'subscription_due_today' end;
          v_title := case when v_payment.obligation_type in ('paylater', 'installment') then 'Installment due today' else 'Subscription due today' end;
          v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due today.';
        else
          v_notif_type := case when v_payment.obligation_type in ('paylater', 'installment') then 'installment_due_soon' else 'subscription_due_soon' end;
          v_title := case when v_payment.obligation_type in ('paylater', 'installment') then 'Installment due soon' else 'Subscription due soon' end;
          v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due in ' || v_offset || ' days.';
        end if;
        v_target_path := '/subscriptions/' || v_payment.obligation_id;
        v_notif_id := public.create_notification(
          v_payment.user_id, v_notif_type, v_title, v_message, 'recurring_obligation', v_payment.obligation_id,
          jsonb_build_object('obligation_id', v_payment.obligation_id, 'payment_id', v_payment.payment_id, 'amount', v_payment.amount, 'due_date', v_payment.due_date, 'target_path', v_target_path)
        );
        update public.notification_reminder_logs set notification_id = v_notif_id
        where payment_id = v_payment.payment_id and reminder_offset = v_offset and due_date = v_payment.due_date;
        notification_id := v_notif_id; user_id := v_payment.user_id; title := v_title; message := v_message; target_path := v_target_path;
        return next;
      exception when unique_violation then null;
      end;
    end loop;

    if v_payment.overdue_reminder_enabled and v_days_diff < 0 then
      begin
        insert into public.notification_reminder_logs (user_id, obligation_id, payment_id, reminder_offset, due_date)
        values (v_payment.user_id, v_payment.obligation_id, v_payment.payment_id, -1, v_payment.due_date);
        v_notif_type := case when v_payment.obligation_type in ('paylater', 'installment') then 'installment_overdue' else 'subscription_overdue' end;
        v_title := case when v_payment.obligation_type in ('paylater', 'installment') then 'Installment overdue' else 'Payment overdue' end;
        v_message := v_payment.obligation_name || ' was due on ' || to_char(v_payment.due_date, 'DD Mon YYYY') || '.';
        v_target_path := '/subscriptions/' || v_payment.obligation_id;
        v_notif_id := public.create_notification(
          v_payment.user_id, v_notif_type, v_title, v_message, 'recurring_obligation', v_payment.obligation_id,
          jsonb_build_object('obligation_id', v_payment.obligation_id, 'payment_id', v_payment.payment_id, 'amount', v_payment.amount, 'due_date', v_payment.due_date, 'target_path', v_target_path)
        );
        update public.notification_reminder_logs set notification_id = v_notif_id
        where payment_id = v_payment.payment_id and reminder_offset = -1 and due_date = v_payment.due_date;
        notification_id := v_notif_id; user_id := v_payment.user_id; title := v_title; message := v_message; target_path := v_target_path;
        return next;
      exception when unique_violation then null;
      end;
    end if;
  end loop;
end;
$$;

-- Personal planning surfaces exclude work and reimbursable expenses.
create or replace function public.get_daily_checkin_summary(p_review_date date)
returns table (
  transaction_id uuid, title text, amount numeric, transaction_date timestamptz,
  category_name text, category_icon text, category_color text, currency char(3),
  transaction_count integer, total_expense numeric, review_status text,
  reviewed_at timestamptz, snoozed_until timestamptz
)
language sql
security definer
set search_path = public
as $$
  with current_user_profile as (
    select p.id, coalesce(nullif(p.daily_checkin_timezone, ''), nullif(p.timezone, ''), 'UTC') as tz, p.default_currency
    from public.profiles p where p.id = auth.uid()
  ), personal_space as (
    select s.id from public.financial_spaces s join current_user_profile p on p.id = s.owner_user_id
    where s.space_type = 'personal' limit 1
  ), eligible as (
    select t.* from public.transactions t
    join current_user_profile p on p.id = t.user_id join personal_space s on s.id = t.space_id
    where t.status = 'completed' and t.type = 'expense' and t.related_entity_type is null
      and t.expense_context = 'personal' and (t.transaction_date at time zone p.tz)::date = p_review_date
  ), totals as (
    select count(*)::integer as count, coalesce(sum(amount), 0)::numeric as total from eligible
  ), review as (
    select d.status, d.reviewed_at, d.snoozed_until from public.daily_checkins d
    where d.user_id = auth.uid() and d.review_date = p_review_date
  )
  select e.id, coalesce(nullif(e.title, ''), nullif(e.note, ''), 'Transaction'), e.amount, e.transaction_date,
    c.name, c.icon, c.color, p.default_currency, totals.count, totals.total, review.status, review.reviewed_at, review.snoozed_until
  from current_user_profile p cross join totals left join eligible e on true
  left join public.categories c on c.id = e.category_id left join review on true
  order by e.transaction_date desc nulls last;
$$;

create or replace function public.invalidate_daily_checkin_after_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.type = 'expense' and new.status = 'completed' and new.related_entity_type is null and new.expense_context = 'personal' then
      perform public.invalidate_daily_checkin_date(new.user_id, new.space_id, new.transaction_date);
    end if;
    return new;
  end if;
  if old.type = 'expense' and old.status = 'completed' and old.related_entity_type is null and old.expense_context = 'personal' then
    perform public.invalidate_daily_checkin_date(old.user_id, old.space_id, old.transaction_date);
  end if;
  if new.type = 'expense' and new.status = 'completed' and new.related_entity_type is null and new.expense_context = 'personal' then
    perform public.invalidate_daily_checkin_date(new.user_id, new.space_id, new.transaction_date);
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_invalidate_daily_checkin on public.transactions;
create trigger transactions_invalidate_daily_checkin
after insert or update of type, status, related_entity_type, expense_context, transaction_date, amount, category_id, envelope_id, wallet_id, space_id
on public.transactions
for each row execute function public.invalidate_daily_checkin_after_transaction_change();

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

-- Preserve the existing budget version, rollover, debt, and goal semantics.
-- Only category/envelope lifestyle spending is narrowed to Personal context.
create or replace function public.get_monthly_budget_progress(
  p_period_start date default null,
  p_space_id uuid default null
)
returns table (
  budget_id uuid, name text, type text, target_type text, category_id uuid,
  category_name text, category_icon text, category_color text, envelope_id uuid,
  envelope_name text, envelope_icon text, envelope_color text, counterparty_id uuid,
  counterparty_name text, debt_id uuid, debt_title text, goal_id uuid,
  goal_name text, goal_icon text, wallet_id uuid, wallet_name text,
  wallet_icon text, wallet_color text, note text, repeat_monthly boolean,
  start_period date, end_period date, base_amount numeric, rollover_enabled boolean,
  rollover_amount numeric, effective_budget numeric, spent numeric, remaining numeric,
  usage_percentage numeric, status text, included_category_ids uuid[],
  included_category_names text[]
)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space_id uuid;
  v_target_period date;
  v_prev_period date;
  v_user_tz text;
  v_target_start_timestamptz timestamptz;
  v_target_end_timestamptz timestamptz;
  v_prev_start_timestamptz timestamptz;
  v_prev_end_timestamptz timestamptz;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  if p_space_id is null then
    select id into v_space_id from public.financial_spaces
    where owner_user_id = v_user_id and space_type = 'personal' limit 1;
  else
    v_space_id := p_space_id;
  end if;
  v_target_period := date_trunc('month', coalesce(p_period_start, current_date))::date;
  v_prev_period := (v_target_period - interval '1 month')::date;
  select coalesce(timezone, 'Asia/Jakarta') into v_user_tz from public.profiles where id = v_user_id;
  v_target_start_timestamptz := (v_target_period::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_target_end_timestamptz := ((v_target_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_prev_start_timestamptz := (v_prev_period::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_prev_end_timestamptz := ((v_prev_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone v_user_tz;

  return query
  with applicable_budgets as (
    select b.id as b_id, b.name as b_name, b.type as b_type, b.target_type as b_target_type,
      b.category_id as b_category_id, b.envelope_id as b_envelope_id,
      b.counterparty_id as b_counterparty_id, b.debt_id as b_debt_id,
      b.goal_id as b_goal_id, b.wallet_id as b_wallet_id, b.note as b_note,
      b.repeat_monthly as b_repeat_monthly, b.start_period as b_start_period, b.end_period as b_end_period
    from public.budgets b
    where b.user_id = v_user_id and (v_space_id is null or b.space_id = v_space_id)
      and b.start_period <= v_target_period
      and ((not b.repeat_monthly and b.start_period = v_target_period)
        or (b.repeat_monthly and (b.end_period is null or b.end_period >= v_target_period)))
  ), resolved_versions as (
    select ab.b_id, bv.amount as ver_amount, bv.rollover_enabled as ver_rollover_enabled
    from applicable_budgets ab cross join lateral (
      select v.amount, v.rollover_enabled from public.budget_versions v
      where v.budget_id = ab.b_id and v.effective_from_period <= v_target_period
      order by v.effective_from_period desc limit 1
    ) bv
  ), current_personal_expenses as (
    select t.* from public.transactions t
    where t.user_id = v_user_id and (v_space_id is null or t.space_id = v_space_id)
      and t.type = 'expense' and t.status = 'completed'
      and coalesce(t.expense_context, 'personal') = 'personal'
      and t.transaction_date >= v_target_start_timestamptz and t.transaction_date < v_target_end_timestamptz
  ), previous_personal_expenses as (
    select t.* from public.transactions t
    where t.user_id = v_user_id and (v_space_id is null or t.space_id = v_space_id)
      and t.type = 'expense' and t.status = 'completed'
      and coalesce(t.expense_context, 'personal') = 'personal'
      and t.transaction_date >= v_prev_start_timestamptz and t.transaction_date < v_prev_end_timestamptz
  ), target_spending as (
    select ab.b_id,
      case
        when ab.b_target_type = 'category' then coalesce((select sum(t.amount) from current_personal_expenses t where t.category_id = ab.b_category_id), 0)
        when ab.b_target_type = 'envelope' then coalesce((select sum(t.amount) from current_personal_expenses t where t.envelope_id = ab.b_envelope_id), 0)
        when ab.b_target_type = 'debt' then coalesce(case
          when ab.b_debt_id is not null then (
            select sum(dpa.allocated_amount) from public.debt_payment_allocations dpa
            join public.debts d on d.id = dpa.debt_id join public.debt_payments dp on dp.id = dpa.debt_payment_id
            where dpa.user_id = v_user_id and (v_space_id is null or d.space_id = v_space_id)
              and dpa.debt_id = ab.b_debt_id and dp.payment_date >= v_target_start_timestamptz and dp.payment_date < v_target_end_timestamptz
          ) when ab.b_counterparty_id is not null then (
            select sum(dp.total_amount) from public.debt_payments dp join public.counterparties cp on cp.id = dp.counterparty_id
            where dp.user_id = v_user_id and (v_space_id is null or cp.space_id = v_space_id)
              and dp.counterparty_id = ab.b_counterparty_id and dp.debt_type = 'debt'
              and dp.payment_date >= v_target_start_timestamptz and dp.payment_date < v_target_end_timestamptz
          ) else (
            select sum(dp.total_amount) from public.debt_payments dp join public.counterparties cp on cp.id = dp.counterparty_id
            where dp.user_id = v_user_id and (v_space_id is null or cp.space_id = v_space_id) and dp.debt_type = 'debt'
              and dp.payment_date >= v_target_start_timestamptz and dp.payment_date < v_target_end_timestamptz
          ) end, 0)
        when ab.b_target_type = 'goal' then coalesce(case
          when ab.b_goal_id is not null then (
            select greatest(sum(gc.amount) - coalesce((select sum(rt.amount) from public.transactions rt
              where rt.user_id = v_user_id and rt.related_entity_id = ab.b_goal_id and rt.related_entity_type = 'goal_refund'
                and rt.status = 'completed' and rt.transaction_date >= v_target_start_timestamptz and rt.transaction_date < v_target_end_timestamptz), 0), 0)
            from public.goal_contributions gc join public.goals g on g.id = gc.goal_id
            left join public.transactions t on t.id = gc.transaction_id
            where gc.user_id = v_user_id and (v_space_id is null or g.space_id = v_space_id) and gc.goal_id = ab.b_goal_id
              and (gc.transaction_id is null or t.status = 'completed') and gc.contribution_date >= v_target_start_timestamptz and gc.contribution_date < v_target_end_timestamptz
          ) when ab.b_wallet_id is not null then (
            select sum(case when t.type = 'transfer' and t.destination_wallet_id = ab.b_wallet_id then t.amount when t.type = 'income' and t.wallet_id = ab.b_wallet_id then t.amount else 0 end)
            from public.transactions t where t.user_id = v_user_id and (v_space_id is null or t.space_id = v_space_id) and t.status = 'completed'
              and ((t.type = 'transfer' and t.destination_wallet_id = ab.b_wallet_id) or (t.type = 'income' and t.wallet_id = ab.b_wallet_id))
              and t.transaction_date >= v_target_start_timestamptz and t.transaction_date < v_target_end_timestamptz
          ) else 0 end, 0)
        else 0
      end as target_spent
    from applicable_budgets ab
  ), prev_month_evaluation as (
    select ab.b_id,
      case when rv.ver_rollover_enabled and (
        (ab.b_repeat_monthly and ab.b_start_period <= v_prev_period and (ab.b_end_period is null or ab.b_end_period >= v_prev_period))
        or (not ab.b_repeat_monthly and ab.b_start_period = v_prev_period)
      ) then greatest(coalesce((select pv.amount from public.budget_versions pv where pv.budget_id = ab.b_id and pv.effective_from_period <= v_prev_period order by pv.effective_from_period desc limit 1), 0) - coalesce(case
        when ab.b_target_type = 'category' then (select sum(t.amount) from previous_personal_expenses t where t.category_id = ab.b_category_id)
        when ab.b_target_type = 'envelope' then (select sum(t.amount) from previous_personal_expenses t where t.envelope_id = ab.b_envelope_id)
        when ab.b_target_type = 'debt' then case
          when ab.b_debt_id is not null then (select sum(dpa.allocated_amount) from public.debt_payment_allocations dpa join public.debts d on d.id = dpa.debt_id join public.debt_payments dp on dp.id = dpa.debt_payment_id where dpa.user_id = v_user_id and (v_space_id is null or d.space_id = v_space_id) and dpa.debt_id = ab.b_debt_id and dp.payment_date >= v_prev_start_timestamptz and dp.payment_date < v_prev_end_timestamptz)
          when ab.b_counterparty_id is not null then (select sum(dp.total_amount) from public.debt_payments dp join public.counterparties cp on cp.id = dp.counterparty_id where dp.user_id = v_user_id and (v_space_id is null or cp.space_id = v_space_id) and dp.counterparty_id = ab.b_counterparty_id and dp.debt_type = 'debt' and dp.payment_date >= v_prev_start_timestamptz and dp.payment_date < v_prev_end_timestamptz)
          else (select sum(dp.total_amount) from public.debt_payments dp join public.counterparties cp on cp.id = dp.counterparty_id where dp.user_id = v_user_id and (v_space_id is null or cp.space_id = v_space_id) and dp.debt_type = 'debt' and dp.payment_date >= v_prev_start_timestamptz and dp.payment_date < v_prev_end_timestamptz)
        end
        when ab.b_target_type = 'goal' then case
          when ab.b_goal_id is not null then (select greatest(sum(gc.amount) - coalesce((select sum(rt.amount) from public.transactions rt where rt.user_id = v_user_id and rt.related_entity_id = ab.b_goal_id and rt.related_entity_type = 'goal_refund' and rt.status = 'completed' and rt.transaction_date >= v_prev_start_timestamptz and rt.transaction_date < v_prev_end_timestamptz), 0), 0) from public.goal_contributions gc join public.goals g on g.id = gc.goal_id left join public.transactions t on t.id = gc.transaction_id where gc.user_id = v_user_id and (v_space_id is null or g.space_id = v_space_id) and gc.goal_id = ab.b_goal_id and (gc.transaction_id is null or t.status = 'completed') and gc.contribution_date >= v_prev_start_timestamptz and gc.contribution_date < v_prev_end_timestamptz)
          when ab.b_wallet_id is not null then (select sum(case when t.type = 'transfer' and t.destination_wallet_id = ab.b_wallet_id then t.amount when t.type = 'income' and t.wallet_id = ab.b_wallet_id then t.amount else 0 end) from public.transactions t where t.user_id = v_user_id and (v_space_id is null or t.space_id = v_space_id) and t.status = 'completed' and ((t.type = 'transfer' and t.destination_wallet_id = ab.b_wallet_id) or (t.type = 'income' and t.wallet_id = ab.b_wallet_id)) and t.transaction_date >= v_prev_start_timestamptz and t.transaction_date < v_prev_end_timestamptz)
          else 0
        end
        else 0 end, 0), 0) else 0 end as rollover_val
    from applicable_budgets ab join resolved_versions rv on rv.b_id = ab.b_id
  )
  select ab.b_id, ab.b_name, ab.b_type, ab.b_target_type, ab.b_category_id, c.name, c.icon, c.color,
    ab.b_envelope_id, e.name, e.icon, e.color, ab.b_counterparty_id, cp.name, ab.b_debt_id, d.title,
    ab.b_goal_id, g.name, g.icon, ab.b_wallet_id, w.name, w.icon, w.color, ab.b_note,
    ab.b_repeat_monthly, ab.b_start_period, ab.b_end_period, rv.ver_amount::numeric(18,2), rv.ver_rollover_enabled,
    pme.rollover_val::numeric(18,2), (rv.ver_amount + pme.rollover_val)::numeric(18,2), ts.target_spent::numeric(18,2),
    ((rv.ver_amount + pme.rollover_val) - ts.target_spent)::numeric(18,2),
    case when (rv.ver_amount + pme.rollover_val) > 0 then round((ts.target_spent / (rv.ver_amount + pme.rollover_val)) * 100, 2) else 0 end::numeric(8,2),
    case when ts.target_spent > (rv.ver_amount + pme.rollover_val) then 'over_budget' when (rv.ver_amount + pme.rollover_val) > 0 and (ts.target_spent / (rv.ver_amount + pme.rollover_val)) >= 0.8 then 'near_limit' else 'healthy' end,
    case when ab.b_target_type = 'category' then array[ab.b_category_id]::uuid[] else '{}'::uuid[] end,
    case when ab.b_target_type = 'category' and c.name is not null then array[c.name]::text[] else '{}'::text[] end
  from applicable_budgets ab join resolved_versions rv on rv.b_id = ab.b_id
  join target_spending ts on ts.b_id = ab.b_id join prev_month_evaluation pme on pme.b_id = ab.b_id
  left join public.categories c on c.id = ab.b_category_id left join public.envelopes e on e.id = ab.b_envelope_id
  left join public.debts d on d.id = ab.b_debt_id left join public.counterparties cp on cp.id = coalesce(ab.b_counterparty_id, d.counterparty_id)
  left join public.goals g on g.id = ab.b_goal_id left join public.wallets w on w.id = ab.b_wallet_id
  order by ab.b_start_period desc, ab.b_name asc;
end;
$$;
