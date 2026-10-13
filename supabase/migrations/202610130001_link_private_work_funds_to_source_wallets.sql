-- Private work funds are allocations held inside a real personal wallet.
-- They are never a second cash location: each fund records its source wallet,
-- while expenses and receipts move the source wallet's real balance.

alter table public.wallets
add column if not exists source_wallet_id uuid references public.wallets(id) on delete restrict;

alter table public.transactions
add column if not exists work_fund_id uuid references public.wallets(id) on delete restrict;

create index if not exists idx_wallets_source_wallet_id
  on public.wallets(source_wallet_id)
  where source_wallet_id is not null;

create index if not exists idx_transactions_work_fund_id
  on public.transactions(work_fund_id)
  where work_fund_id is not null;

-- A fund's remaining amount is independent of the ledger balance of its
-- virtual wallet row. This also retains the display of any pre-link legacy
-- work fund until its source wallet can be assigned deliberately.
create or replace view public.work_fund_summary_view
with (security_invoker = true) as
with receipts as (
  select
    coalesce(t.work_fund_id, t.wallet_id) as work_fund_id,
    coalesce(sum(t.amount), 0)::numeric(18,2) as recorded_receipts
  from public.transactions t
  where t.status = 'completed'
    and t.type = 'adjustment'
    and t.related_entity_type = 'work_fund_receipt'
  group by coalesce(t.work_fund_id, t.wallet_id)
),
spending as (
  select
    coalesce(t.work_fund_id, t.wallet_id) as work_fund_id,
    coalesce(sum(t.amount + coalesce(t.transfer_fee, 0)), 0)::numeric(18,2) as spent_amount
  from public.transactions t
  where t.status = 'completed'
    and t.type = 'expense'
    and coalesce(t.expense_context, 'personal') = 'work'
  group by coalesce(t.work_fund_id, t.wallet_id)
),
fund_totals as (
  select
    w.id as wallet_id,
    w.user_id,
    w.work_fund_kind,
    w.source_wallet_id,
    (w.initial_balance + coalesce(r.recorded_receipts, 0))::numeric(18,2) as total_received,
    coalesce(s.spent_amount, 0)::numeric(18,2) as spent_amount
  from public.wallets w
  left join receipts r on r.work_fund_id = w.id
  left join spending s on s.work_fund_id = w.id
  where w.work_fund_kind is not null
)
select
  f.wallet_id,
  f.user_id,
  f.work_fund_kind,
  f.total_received,
  greatest(f.total_received - f.spent_amount, 0)::numeric(18,2) as current_balance,
  f.spent_amount,
  case
    when f.total_received > 0 then round(f.spent_amount / f.total_received * 100, 2)
    else 0
  end::numeric(8,2) as usage_percentage,
  f.source_wallet_id,
  source.name as source_wallet_name,
  source.currency as source_wallet_currency
from fund_totals f
left join public.wallets source on source.id = f.source_wallet_id;

grant select on public.work_fund_summary_view to authenticated;

-- Keep the physical balance in current_balance, but expose the money that is
-- actually available to the user after active work-fund allocations.
create or replace view public.wallet_balance_view
with (security_invoker = true) as
with transaction_totals as (
  select w_1.id as wallet_id,
    coalesce(sum(
      case
        when t.status <> 'completed'::transaction_status then 0::numeric
        when t.type = 'income'::transaction_type and t.wallet_id = w_1.id then t.amount
        when t.type = 'expense'::transaction_type and t.wallet_id = w_1.id then -(t.amount + coalesce(t.transfer_fee, 0))
        when t.type = 'adjustment'::transaction_type and t.wallet_id = w_1.id then t.amount
        when t.type = 'transfer'::transaction_type and t.wallet_id = w_1.id then -(t.amount + coalesce(t.transfer_fee, 0))
        when t.type = 'transfer'::transaction_type and t.destination_wallet_id = w_1.id then t.amount
        else 0::numeric
      end
    ), 0::numeric)::numeric(18,2) as transaction_total
  from public.wallets w_1
  left join public.transactions t on t.wallet_id = w_1.id or t.destination_wallet_id = w_1.id
  group by w_1.id
),
activity_totals as (
  select a.wallet_id,
    coalesce(sum(
      case
        when a.activity_type = 'realized_gain' then a.amount
        when a.activity_type = 'realized_loss' then -a.amount
        else 0::numeric
      end
    ), 0::numeric)::numeric(18,2) as realized_pnl
  from public.investment_activities a
  group by a.wallet_id
),
work_fund_reservations as (
  select
    source_wallet_id as wallet_id,
    coalesce(sum(current_balance), 0)::numeric(18,2) as reserved_for_work_funds
  from public.work_fund_summary_view
  where source_wallet_id is not null
  group by source_wallet_id
)
select
  w.id as wallet_id,
  w.user_id,
  w.initial_balance,
  coalesce(tt.transaction_total, 0::numeric)::numeric(18,2) as transaction_total,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null then w.current_market_value
    else (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))
  end::numeric(18,2) as current_balance,
  0::numeric(18,2) as allocated_to_goals,
  case
    when w.work_fund_kind is not null then 0::numeric(18,2)
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null then w.current_market_value
    else (w.initial_balance + coalesce(tt.transaction_total, 0::numeric)) - coalesce(wfr.reserved_for_work_funds, 0::numeric)
  end::numeric(18,2) as available_balance,
  (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))::numeric(18,2) as cost_basis,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null
      then (w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))) - coalesce(act.realized_pnl, 0::numeric)
    else 0::numeric
  end::numeric(18,2) as unrealized_gain_loss,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null and (w.initial_balance + coalesce(tt.transaction_total, 0::numeric)) > 0
      then round((((w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))) / (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))) * 100::numeric), 2)
    else null::numeric(8,2)
  end::numeric(8,2) as return_percentage,
  w.last_valuation_at,
  (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))::numeric(18,2) as net_contributions,
  coalesce(act.realized_pnl, 0::numeric)::numeric(18,2) as realized_pnl,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null
      then (w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0::numeric)))
    else 0::numeric
  end::numeric(18,2) as total_pnl,
  case
    when w.wallet_type = 'investment'::wallet_type and w.current_market_value is not null
      then (w.current_market_value - (w.initial_balance + coalesce(tt.transaction_total, 0::numeric))) - coalesce(act.realized_pnl, 0::numeric)
    else 0::numeric
  end::numeric(18,2) as unrealized_pnl,
  coalesce(wfr.reserved_for_work_funds, 0)::numeric(18,2) as reserved_for_work_funds
from public.wallets w
left join transaction_totals tt on tt.wallet_id = w.id
left join activity_totals act on act.wallet_id = w.id
left join work_fund_reservations wfr on wfr.wallet_id = w.id;

grant select on public.wallet_balance_view to authenticated;

create or replace function public.enforce_private_work_fund_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.financial_spaces%rowtype;
  v_source public.wallets%rowtype;
begin
  if new.work_fund_kind is null then
    return new;
  end if;

  if current_setting('kash.work_fund_write', true) is distinct from 'on'
    and (tg_op = 'INSERT' or old.work_fund_kind is distinct from new.work_fund_kind) then
    raise exception 'Work funds must be created through create_work_fund';
  end if;

  select * into v_space
  from public.financial_spaces
  where id = new.space_id;

  if not found
    or v_space.space_type <> 'personal'
    or v_space.owner_user_id <> new.user_id then
    raise exception 'Work funds must belong to the owner personal space';
  end if;

  if new.wallet_type <> 'custom' then
    raise exception 'Work funds must use the custom wallet type';
  end if;

  if new.include_in_net_worth then
    raise exception 'Work funds cannot be included in net worth';
  end if;

  if tg_op = 'INSERT' and new.source_wallet_id is null then
    raise exception 'Work funds must have a source wallet';
  end if;

  if new.source_wallet_id is not null then
    select * into v_source
    from public.wallets
    where id = new.source_wallet_id;

    if not found
      or v_source.user_id <> new.user_id
      or v_source.space_id <> new.space_id
      or v_source.is_archived
      or v_source.work_fund_kind is not null
      or v_source.wallet_type not in ('bank', 'digital_bank', 'ewallet', 'cash') then
      raise exception 'Work fund source must be an active personal liquid wallet';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and old.work_fund_kind is not null
    and new.work_fund_kind is distinct from old.work_fund_kind then
    raise exception 'Work fund type cannot be changed';
  end if;

  if tg_op = 'UPDATE'
    and old.source_wallet_id is not null
    and new.source_wallet_id is distinct from old.source_wallet_id then
    raise exception 'Work fund source wallet cannot be changed';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_work_fund_source_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.is_archived is distinct from old.is_archived or new.space_id is distinct from old.space_id)
    and exists (
      select 1
      from public.work_fund_summary_view wf
      where wf.source_wallet_id = old.id
        and wf.current_balance > 0
    ) then
    raise exception 'A source wallet with active work-fund money cannot be archived or moved';
  end if;

  return new;
end;
$$;

drop trigger if exists wallets_enforce_work_fund_source_wallet on public.wallets;
create trigger wallets_enforce_work_fund_source_wallet
before update on public.wallets
for each row execute function public.enforce_work_fund_source_wallet();

drop function if exists public.create_work_fund(text, text, numeric, text, text, text);
create function public.create_work_fund(
  p_name text,
  p_kind text,
  p_source_wallet_id uuid,
  p_initial_amount numeric default 0,
  p_currency text default null,
  p_icon text default 'wallet',
  p_color text default '#0F766E'
)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space_id uuid;
  v_source public.wallets%rowtype;
  v_available_balance numeric;
  v_currency char(3);
  v_wallet public.wallets%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Work fund name is required';
  end if;
  if p_kind not in ('meal', 'project') then
    raise exception 'Invalid work fund type';
  end if;
  if p_source_wallet_id is null then
    raise exception 'A source wallet is required';
  end if;
  if coalesce(p_initial_amount, 0) < 0 then
    raise exception 'Initial work fund amount cannot be negative';
  end if;

  select id into v_space_id
  from public.financial_spaces
  where owner_user_id = v_user_id
    and space_type = 'personal'
    and is_archived = false
  limit 1;

  if v_space_id is null then
    raise exception 'Personal Space was not found';
  end if;

  select * into v_source
  from public.wallets
  where id = p_source_wallet_id
    and user_id = v_user_id
    and space_id = v_space_id
    and is_archived = false
    and work_fund_kind is null
    and wallet_type in ('bank', 'digital_bank', 'ewallet', 'cash')
  for update;

  if not found then
    raise exception 'Selected source wallet is not an active personal liquid wallet';
  end if;

  select available_balance into v_available_balance
  from public.wallet_balance_view
  where wallet_id = v_source.id;

  if coalesce(p_initial_amount, 0) > coalesce(v_available_balance, 0) then
    raise exception 'Work fund allocation exceeds the available source-wallet balance';
  end if;

  if p_currency is not null and upper(trim(p_currency)) <> v_source.currency then
    raise exception 'Work fund currency must match its source wallet';
  end if;
  v_currency := v_source.currency;

  perform set_config('kash.work_fund_write', 'on', true);

  insert into public.wallets (
    user_id,
    space_id,
    name,
    wallet_type,
    initial_balance,
    currency,
    icon,
    color,
    include_in_net_worth,
    work_fund_kind,
    source_wallet_id
  ) values (
    v_user_id,
    v_space_id,
    trim(p_name),
    'custom',
    coalesce(p_initial_amount, 0),
    v_currency,
    coalesce(nullif(trim(p_icon), ''), 'wallet'),
    coalesce(nullif(trim(p_color), ''), '#0F766E'),
    false,
    p_kind,
    v_source.id
  ) returning * into v_wallet;

  return v_wallet;
end;
$$;

create or replace function public.record_work_fund_receipt(
  p_wallet_id uuid,
  p_amount numeric,
  p_transaction_date timestamptz default now(),
  p_note text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_fund public.wallets%rowtype;
  v_transaction public.transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Work fund receipt amount must be greater than zero';
  end if;

  select w.* into v_fund
  from public.wallets w
  join public.financial_spaces s on s.id = w.space_id
  where w.id = p_wallet_id
    and w.user_id = v_user_id
    and w.work_fund_kind is not null
    and w.source_wallet_id is not null
    and w.is_archived = false
    and s.space_type = 'personal'
    and s.owner_user_id = v_user_id
  for update of w;

  if not found then
    raise exception 'Private work fund with an active source wallet was not found';
  end if;

  perform set_config('kash.work_fund_write', 'on', true);

  insert into public.transactions (
    user_id,
    space_id,
    type,
    amount,
    wallet_id,
    work_fund_id,
    transaction_date,
    title,
    note,
    status,
    expense_context,
    related_entity_type
  ) values (
    v_user_id,
    v_fund.space_id,
    'adjustment',
    p_amount,
    v_fund.source_wallet_id,
    v_fund.id,
    coalesce(p_transaction_date, now()),
    'Dana kerja diterima',
    nullif(trim(coalesce(p_note, '')), ''),
    'completed',
    'personal',
    'work_fund_receipt'
  ) returning * into v_transaction;

  return v_transaction;
end;
$$;

-- Work-funded expenses still use the canonical contextual-expense writer.
-- This wrapper supplies the allocation link only after the normal expense
-- invariants have been validated and written.
create or replace function public.record_work_fund_contextual_expense(
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
  p_wallet_id uuid,
  p_work_fund_id uuid
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_fund public.wallets%rowtype;
  v_existing public.transactions%rowtype;
  v_remaining numeric;
  v_transaction public.transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_work_fund_id is not null then
    if coalesce(nullif(trim(p_context), ''), 'personal') <> 'work' then
      raise exception 'A work fund can only pay a Work expense';
    end if;

    select w.* into v_fund
    from public.wallets w
    join public.financial_spaces s on s.id = w.space_id
    where w.id = p_work_fund_id
      and w.user_id = v_user_id
      and w.space_id = p_space_id
      and w.work_fund_kind is not null
      and w.source_wallet_id is not null
      and w.is_archived = false
      and s.space_type = 'personal'
      and s.owner_user_id = v_user_id
    for update of w;

    if not found then
      raise exception 'Selected work fund was not found';
    end if;
    if p_wallet_id <> v_fund.source_wallet_id then
      raise exception 'Work expenses must use the selected fund source wallet';
    end if;
  elsif p_transaction_id is null then
    raise exception 'A work fund is required when creating a work-funded expense';
  end if;

  if p_transaction_id is not null then
    select * into v_existing
    from public.transactions
    where id = p_transaction_id
      and space_id = p_space_id
      and user_id = v_user_id
    for update;

    if not found then
      raise exception 'The work-funded transaction was not found';
    end if;
  end if;

  if p_work_fund_id is not null then
    select current_balance into v_remaining
    from public.work_fund_summary_view
    where wallet_id = v_fund.id;

    if v_existing.id is not null
      and v_existing.work_fund_id = v_fund.id
      and v_existing.status = 'completed' then
      v_remaining := coalesce(v_remaining, 0) + v_existing.amount + coalesce(v_existing.transfer_fee, 0);
    end if;

    if p_amount > coalesce(v_remaining, 0) then
      raise exception 'Work fund balance is not enough for this expense';
    end if;
  elsif v_existing.work_fund_id is null then
    raise exception 'Only an existing work-funded expense can remove its work fund';
  else
    -- Clear the allocation first, while the original Work transaction is
    -- still valid. The canonical writer can then safely reclassify it.
    update public.transactions
    set work_fund_id = null
    where id = v_existing.id;
  end if;

  if p_work_fund_id is not null then
    perform set_config('kash.work_fund_write', 'on', true);
  end if;

  select * into v_transaction
  from public.record_contextual_expense(
    p_amount,
    p_category_id,
    p_context,
    p_counterparty_name,
    p_envelope_id,
    p_note,
    p_space_id,
    p_title,
    p_transaction_date,
    p_transaction_id,
    p_wallet_id
  );

  if p_work_fund_id is not null then
    update public.transactions
    set work_fund_id = v_fund.id
    where id = v_transaction.id
    returning * into v_transaction;
  end if;

  return v_transaction;
end;
$$;

create or replace function public.enforce_work_fund_transaction_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_work_fund_kind text;
  v_destination_work_fund_kind text;
  v_linked_fund public.wallets%rowtype;
begin
  select work_fund_kind into v_source_work_fund_kind
  from public.wallets
  where id = new.wallet_id;

  select work_fund_kind into v_destination_work_fund_kind
  from public.wallets
  where id = new.destination_wallet_id;

  if v_destination_work_fund_kind is not null then
    raise exception 'Work funds cannot receive transfers';
  end if;

  if new.work_fund_id is not null then
    select * into v_linked_fund
    from public.wallets
    where id = new.work_fund_id
      and work_fund_kind is not null;

    if not found or v_linked_fund.source_wallet_id is null then
      raise exception 'Selected work fund source was not found';
    end if;
    if new.wallet_id <> v_linked_fund.source_wallet_id then
      raise exception 'Work-fund transactions must use their source wallet';
    end if;
    if current_setting('kash.work_fund_write', true) is distinct from 'on' then
      raise exception 'Work-fund transactions must be recorded through their dedicated action';
    end if;
    if new.type = 'expense'
      and coalesce(new.expense_context, 'personal') = 'work' then
      return new;
    end if;
    if new.type = 'adjustment'
      and new.amount > 0
      and new.related_entity_type = 'work_fund_receipt' then
      return new;
    end if;
    raise exception 'Work funds can only be used for Work expenses or recorded work-fund receipts';
  end if;

  -- Pre-link legacy funds retain their historical ledger entries, but no new
  -- direct virtual-wallet flow can be created by the standard transaction UI.
  if v_source_work_fund_kind is null or new.status <> 'completed' then
    return new;
  end if;
  if new.type = 'expense'
    and coalesce(new.expense_context, 'personal') = 'work' then
    return new;
  end if;
  if new.type = 'adjustment'
    and new.amount > 0
    and new.related_entity_type = 'work_fund_receipt'
    and current_setting('kash.work_fund_write', true) = 'on' then
    return new;
  end if;
  raise exception 'Private work funds can only be used for Work expenses or recorded work-fund receipts';
end;
$$;

create or replace function public.enforce_transaction_wallet_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required numeric := 0;
  v_current_balance numeric;
  v_available_balance numeric;
  v_old_wallet_effect numeric := 0;
  v_spendable_balance numeric;
begin
  if new.wallet_id is null or new.status <> 'completed' then
    return new;
  end if;

  v_required := case
    when new.type = 'expense' then new.amount + coalesce(new.transfer_fee, 0)
    when new.type = 'transfer' then new.amount + coalesce(new.transfer_fee, 0)
    when new.type = 'adjustment' and new.amount < 0 then -new.amount
    else 0
  end;

  if v_required <= 0 then
    return new;
  end if;

  perform 1
  from public.wallets w
  where w.id = new.wallet_id
  for update;

  if not found then
    raise exception 'Transaction source wallet was not found.';
  end if;

  select wb.current_balance, wb.available_balance
  into v_current_balance, v_available_balance
  from public.wallet_balance_view wb
  where wb.wallet_id = new.wallet_id;

  if v_current_balance is null or v_available_balance is null then
    raise exception 'Transaction source wallet balance could not be resolved.';
  end if;

  if tg_op = 'UPDATE' and old.wallet_id = new.wallet_id then
    v_old_wallet_effect := case
      when old.status <> 'completed' then 0
      when old.type = 'income' then old.amount
      when old.type = 'expense' then -(old.amount + coalesce(old.transfer_fee, 0))
      when old.type = 'transfer' then -(old.amount + coalesce(old.transfer_fee, 0))
      when old.type = 'adjustment' then old.amount
      else 0
    end;
  end if;

  v_spendable_balance := case
    when new.work_fund_id is not null then v_current_balance
    else v_available_balance
  end - v_old_wallet_effect;

  if v_spendable_balance < v_required then
    raise exception 'Insufficient wallet balance for this transaction.';
  end if;

  return new;
end;
$$;

-- A Work-funded expense may be converted into a managed reimbursement only
-- after its allocation link is removed under ownership checks. The existing
-- canonical conversion RPC then owns the cross-space event and receivable.
create or replace function public.convert_work_fund_expense_to_managed_reimbursement(
  p_amount numeric,
  p_client_request_id uuid,
  p_managed_category_id uuid,
  p_managed_space_id uuid,
  p_note text,
  p_personal_wallet_id uuid,
  p_source_transaction_id uuid,
  p_title text,
  p_transaction_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_source
  from public.transactions
  where id = p_source_transaction_id
    and user_id = v_user_id
  for update;

  if not found
    or v_source.work_fund_id is null
    or v_source.type <> 'expense'
    or v_source.status <> 'completed' then
    raise exception 'Only an existing work-funded expense can be converted';
  end if;

  update public.transactions
  set work_fund_id = null
  where id = v_source.id;

  return public.convert_expense_to_managed_reimbursement(
    p_amount,
    p_client_request_id,
    p_managed_category_id,
    p_managed_space_id,
    p_note,
    p_personal_wallet_id,
    p_source_transaction_id,
    p_title,
    p_transaction_date
  );
end;
$$;

revoke all on function public.create_work_fund(text, text, uuid, numeric, text, text, text) from public, anon;
grant execute on function public.create_work_fund(text, text, uuid, numeric, text, text, text) to authenticated;

revoke all on function public.record_work_fund_receipt(uuid, numeric, timestamptz, text) from public, anon;
grant execute on function public.record_work_fund_receipt(uuid, numeric, timestamptz, text) to authenticated;

revoke all on function public.record_work_fund_contextual_expense(numeric, uuid, text, text, uuid, text, uuid, text, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.record_work_fund_contextual_expense(numeric, uuid, text, text, uuid, text, uuid, text, timestamptz, uuid, uuid, uuid) to authenticated;

revoke all on function public.convert_work_fund_expense_to_managed_reimbursement(numeric, uuid, uuid, uuid, text, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.convert_work_fund_expense_to_managed_reimbursement(numeric, uuid, uuid, uuid, text, uuid, uuid, text, timestamptz) to authenticated;
