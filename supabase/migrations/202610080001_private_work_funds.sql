-- Private work funds model money held for office purposes without putting it
-- into a Managed Space. The wallet remains owned by the user's Personal Space,
-- is excluded from personal net worth, and can only be spent through a Work
-- contextual expense.

alter table public.wallets
add column if not exists work_fund_kind text;

alter table public.wallets
drop constraint if exists wallets_work_fund_kind_valid;

alter table public.wallets
add constraint wallets_work_fund_kind_valid
check (work_fund_kind is null or work_fund_kind in ('meal', 'project'));

create or replace function public.enforce_private_work_fund_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space public.financial_spaces%rowtype;
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

  if tg_op = 'UPDATE'
    and old.work_fund_kind is not null
    and new.work_fund_kind is distinct from old.work_fund_kind then
    raise exception 'Work fund type cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists wallets_enforce_private_work_fund on public.wallets;
create trigger wallets_enforce_private_work_fund
before insert or update on public.wallets
for each row execute function public.enforce_private_work_fund_wallet();

create or replace function public.create_work_fund(
  p_name text,
  p_kind text,
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

  select coalesce(nullif(upper(trim(p_currency)), ''), default_currency, 'IDR')::char(3)
  into v_currency
  from public.profiles
  where id = v_user_id;

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
    work_fund_kind
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
    p_kind
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
  v_wallet public.wallets%rowtype;
  v_transaction public.transactions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Work fund receipt amount must be greater than zero';
  end if;

  select w.* into v_wallet
  from public.wallets w
  join public.financial_spaces s on s.id = w.space_id
  where w.id = p_wallet_id
    and w.user_id = v_user_id
    and w.work_fund_kind is not null
    and w.is_archived = false
    and s.space_type = 'personal'
    and s.owner_user_id = v_user_id
  for update of w;

  if not found then
    raise exception 'Private work fund was not found';
  end if;

  perform set_config('kash.work_fund_write', 'on', true);

  insert into public.transactions (
    user_id,
    space_id,
    type,
    amount,
    wallet_id,
    transaction_date,
    title,
    note,
    status,
    expense_context,
    related_entity_type
  ) values (
    v_user_id,
    v_wallet.space_id,
    'adjustment',
    p_amount,
    v_wallet.id,
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

create or replace function public.enforce_work_fund_transaction_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_work_fund_kind text;
  v_destination_work_fund_kind text;
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

drop trigger if exists transactions_enforce_work_fund_usage on public.transactions;
create trigger transactions_enforce_work_fund_usage
before insert or update on public.transactions
for each row execute function public.enforce_work_fund_transaction_usage();

create or replace view public.work_fund_summary_view
with (security_invoker = true) as
with receipt_totals as (
  select
    t.wallet_id,
    coalesce(sum(t.amount), 0)::numeric(18,2) as recorded_receipts
  from public.transactions t
  where t.status = 'completed'
    and t.type = 'adjustment'
    and t.related_entity_type = 'work_fund_receipt'
  group by t.wallet_id
)
select
  w.id as wallet_id,
  w.user_id,
  w.work_fund_kind,
  (w.initial_balance + coalesce(rt.recorded_receipts, 0))::numeric(18,2) as total_received,
  wb.current_balance,
  greatest(
    (w.initial_balance + coalesce(rt.recorded_receipts, 0)) - wb.current_balance,
    0
  )::numeric(18,2) as spent_amount,
  case
    when (w.initial_balance + coalesce(rt.recorded_receipts, 0)) > 0 then
      round(
        greatest(
          (w.initial_balance + coalesce(rt.recorded_receipts, 0)) - wb.current_balance,
          0
        ) / (w.initial_balance + coalesce(rt.recorded_receipts, 0)) * 100,
        2
      )
    else 0
  end::numeric(8,2) as usage_percentage
from public.wallets w
join public.wallet_balance_view wb on wb.wallet_id = w.id
left join receipt_totals rt on rt.wallet_id = w.id
where w.work_fund_kind is not null;

grant select on public.work_fund_summary_view to authenticated;

revoke all on function public.create_work_fund(text, text, numeric, text, text, text) from public, anon;
grant execute on function public.create_work_fund(text, text, numeric, text, text, text) to authenticated;

revoke all on function public.record_work_fund_receipt(uuid, numeric, timestamptz, text) from public, anon;
grant execute on function public.record_work_fund_receipt(uuid, numeric, timestamptz, text) to authenticated;
