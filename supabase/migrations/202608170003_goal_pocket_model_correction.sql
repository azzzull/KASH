alter table public.goals
add column if not exists wallet_id uuid references public.wallets(id);

alter table public.goal_contributions
add column if not exists transaction_id uuid references public.transactions(id);

create index if not exists goals_wallet_id_idx on public.goals(wallet_id);
create index if not exists goal_contributions_transaction_id_idx on public.goal_contributions(transaction_id);

insert into public.wallets (
  user_id,
  name,
  wallet_type,
  institution_name,
  account_reference,
  initial_balance,
  currency,
  icon,
  color,
  include_in_net_worth,
  is_archived
)
select
  g.user_id,
  g.name || ' Pocket',
  'savings',
  'Goal Pocket',
  'goal:' || g.id::text,
  0,
  coalesce(p.default_currency, 'IDR'),
  coalesce(g.icon, 'piggy-bank'),
  '#F5B82E',
  true,
  false
from public.goals g
left join public.profiles p on p.id = g.user_id
where g.wallet_id is null
  and not exists (
    select 1
    from public.wallets w
    where w.user_id = g.user_id
      and w.account_reference = 'goal:' || g.id::text
  );

update public.goals g
set wallet_id = w.id
from public.wallets w
where g.wallet_id is null
  and w.user_id = g.user_id
  and w.account_reference = 'goal:' || g.id::text;

with inserted_transfers as (
  insert into public.transactions (
    user_id,
    type,
    amount,
    wallet_id,
    destination_wallet_id,
    transfer_fee,
    transaction_date,
    title,
    note,
    status,
    related_entity_type,
    related_entity_id
  )
  select
    gc.user_id,
    'transfer',
    gc.amount,
    gc.wallet_id,
    g.wallet_id,
    0,
    gc.contribution_date,
    'Goal Contribution: ' || g.name,
    gc.note,
    'completed',
    'goal_contribution',
    gc.id
  from public.goal_contributions gc
  join public.goals g on g.id = gc.goal_id
  where gc.transaction_id is null
    and g.wallet_id is not null
    and gc.wallet_id <> g.wallet_id
  returning id, related_entity_id
)
update public.goal_contributions gc
set transaction_id = it.id
from inserted_transfers it
where gc.id = it.related_entity_id;

create or replace view public.wallet_balance_view
with (security_invoker = true) as
with transaction_totals as (
  select
    w.id as wallet_id,
    coalesce(sum(
      case
        when t.status <> 'completed' then 0
        when t.type = 'income' and t.wallet_id = w.id then t.amount
        when t.type = 'expense' and t.wallet_id = w.id then -t.amount
        when t.type = 'adjustment' and t.wallet_id = w.id then t.amount
        when t.type = 'transfer' and t.wallet_id = w.id then -(t.amount + t.transfer_fee)
        when t.type = 'transfer' and t.destination_wallet_id = w.id then t.amount
        else 0
      end
    ), 0)::numeric(18,2) as transaction_total
  from public.wallets w
  left join public.transactions t
    on t.wallet_id = w.id
    or t.destination_wallet_id = w.id
  group by w.id
)
select
  w.id as wallet_id,
  w.user_id,
  w.initial_balance,
  coalesce(tt.transaction_total, 0)::numeric(18,2) as transaction_total,
  (w.initial_balance + coalesce(tt.transaction_total, 0))::numeric(18,2) as current_balance,
  0::numeric(18,2) as allocated_to_goals,
  (w.initial_balance + coalesce(tt.transaction_total, 0))::numeric(18,2) as available_balance
from public.wallets w
left join transaction_totals tt on tt.wallet_id = w.id;

create or replace view public.goal_progress_view
with (security_invoker = true) as
select
  g.id as goal_id,
  g.user_id,
  g.target_amount,
  coalesce(wb.current_balance, 0)::numeric(18,2) as current_amount,
  greatest((g.target_amount - coalesce(wb.current_balance, 0)), 0)::numeric(18,2) as remaining_amount,
  case
    when g.target_amount > 0 then least((coalesce(wb.current_balance, 0) / g.target_amount) * 100, 100)
    else 0
  end::numeric(8,2) as percentage
from public.goals g
left join public.wallet_balance_view wb on wb.wallet_id = g.wallet_id;

create or replace function public.validate_goal_contribution_relationships()
returns trigger
language plpgsql
as $$
declare
  goal_owner_id uuid;
  goal_state public.goal_status;
  goal_wallet_id uuid;
  source_wallet_user_id uuid;
  transaction_record public.transactions;
begin
  select user_id, status, wallet_id
  into goal_owner_id, goal_state, goal_wallet_id
  from public.goals
  where id = new.goal_id;

  if goal_owner_id is null or goal_owner_id <> new.user_id then
    raise exception 'Goal must belong to the contribution user.';
  end if;

  if goal_state = 'cancelled' then
    raise exception 'Cancelled goals cannot receive contributions.';
  end if;

  if goal_wallet_id is null then
    raise exception 'Goal must have a linked pocket wallet.';
  end if;

  select user_id
  into source_wallet_user_id
  from public.wallets
  where id = new.wallet_id;

  if source_wallet_user_id is null or source_wallet_user_id <> new.user_id then
    raise exception 'Contribution source wallet must belong to the contribution user.';
  end if;

  if new.wallet_id = goal_wallet_id then
    raise exception 'Contribution source wallet must be different from the goal pocket.';
  end if;

  if new.transaction_id is not null then
    select *
    into transaction_record
    from public.transactions
    where id = new.transaction_id;

    if transaction_record.id is null
      or transaction_record.user_id <> new.user_id
      or transaction_record.type <> 'transfer'
      or transaction_record.status <> 'completed'
      or transaction_record.wallet_id <> new.wallet_id
      or transaction_record.destination_wallet_id <> goal_wallet_id
      or transaction_record.amount <> new.amount then
      raise exception 'Goal contribution transaction must be a matching completed transfer to the goal pocket.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.create_goal_with_pocket(
  p_name text,
  p_target_amount numeric,
  p_deadline date default null,
  p_icon text default null,
  p_note text default null,
  p_pocket_institution text default null
)
returns public.goals
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  default_currency char(3);
  new_goal_id uuid := gen_random_uuid();
  pocket_wallet_id uuid;
  created_goal public.goals;
begin
  if current_user_id is null then
    raise exception 'You need to be signed in to create a goal.';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Goal name is required.';
  end if;

  if p_target_amount is null or p_target_amount <= 0 then
    raise exception 'Target amount must be greater than zero.';
  end if;

  select p.default_currency
  into default_currency
  from public.profiles p
  where p.id = current_user_id;

  insert into public.wallets (
    user_id,
    name,
    wallet_type,
    institution_name,
    account_reference,
    initial_balance,
    currency,
    icon,
    color,
    include_in_net_worth,
    is_archived
  )
  values (
    current_user_id,
    trim(p_name) || ' Pocket',
    'savings',
    coalesce(nullif(trim(p_pocket_institution), ''), 'Goal Pocket'),
    'goal:' || new_goal_id::text,
    0,
    coalesce(default_currency, 'IDR'),
    coalesce(nullif(trim(p_icon), ''), 'piggy-bank'),
    '#F5B82E',
    true,
    false
  )
  returning id into pocket_wallet_id;

  insert into public.goals (
    id,
    user_id,
    wallet_id,
    name,
    target_amount,
    deadline,
    icon,
    note,
    status
  )
  values (
    new_goal_id,
    current_user_id,
    pocket_wallet_id,
    trim(p_name),
    p_target_amount,
    p_deadline,
    nullif(trim(p_icon), ''),
    nullif(trim(p_note), ''),
    'active'
  )
  returning * into created_goal;

  return created_goal;
end;
$$;

create or replace function public.create_goal_contribution(
  p_goal_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_contribution_date timestamptz default now(),
  p_note text default null
)
returns public.goal_contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  goal_record public.goals;
  source_balance numeric(18,2);
  new_contribution_id uuid := gen_random_uuid();
  created_transaction_id uuid;
  created_contribution public.goal_contributions;
begin
  if current_user_id is null then
    raise exception 'You need to be signed in to add a goal contribution.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Contribution amount must be greater than zero.';
  end if;

  select *
  into goal_record
  from public.goals
  where id = p_goal_id
    and user_id = current_user_id
    and status <> 'cancelled'
  for update;

  if goal_record.id is null or goal_record.wallet_id is null then
    raise exception 'Goal not found or has no pocket wallet.';
  end if;

  perform 1
  from public.wallets
  where id = p_wallet_id
    and user_id = current_user_id
    and is_archived = false
  for update;

  if not found then
    raise exception 'Source wallet not found or archived.';
  end if;

  if p_wallet_id = goal_record.wallet_id then
    raise exception 'Source wallet must be different from the goal pocket.';
  end if;

  select current_balance
  into source_balance
  from public.wallet_balance_view
  where wallet_id = p_wallet_id
    and user_id = current_user_id;

  if coalesce(source_balance, 0) < p_amount then
    raise exception 'Contribution exceeds source wallet balance.';
  end if;

  insert into public.transactions (
    user_id,
    type,
    amount,
    wallet_id,
    destination_wallet_id,
    transfer_fee,
    transaction_date,
    title,
    note,
    status,
    related_entity_type,
    related_entity_id
  )
  values (
    current_user_id,
    'transfer',
    p_amount,
    p_wallet_id,
    goal_record.wallet_id,
    0,
    coalesce(p_contribution_date, now()),
    'Goal Contribution: ' || goal_record.name,
    nullif(trim(p_note), ''),
    'completed',
    'goal_contribution',
    new_contribution_id
  )
  returning id into created_transaction_id;

  insert into public.goal_contributions (
    id,
    goal_id,
    user_id,
    wallet_id,
    transaction_id,
    amount,
    contribution_date,
    note
  )
  values (
    new_contribution_id,
    p_goal_id,
    current_user_id,
    p_wallet_id,
    created_transaction_id,
    p_amount,
    coalesce(p_contribution_date, now()),
    nullif(trim(p_note), '')
  )
  returning * into created_contribution;

  return created_contribution;
end;
$$;

create or replace function public.prevent_goal_contribution_transaction_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.related_entity_type = 'goal_contribution' then
    raise exception 'Goal contribution transfers are managed from Goals and cannot be edited directly.';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_prevent_goal_contribution_mutation on public.transactions;
create trigger transactions_prevent_goal_contribution_mutation
before update on public.transactions
for each row execute function public.prevent_goal_contribution_transaction_mutation();

drop policy if exists "Users can create own goals" on public.goals;
create policy "Users can create own goals"
on public.goals for insert
to authenticated
with check (
  auth.uid() = user_id
  and wallet_id is not null
  and exists (
    select 1
    from public.wallets w
    where w.id = wallet_id
      and w.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own goals" on public.goals;
create policy "Users can update own goals"
on public.goals for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and wallet_id is not null
  and exists (
    select 1
    from public.wallets w
    where w.id = wallet_id
      and w.user_id = auth.uid()
  )
);

grant select on public.wallet_balance_view to authenticated;
grant select on public.goal_progress_view to authenticated;
grant execute on function public.create_goal_with_pocket(text, numeric, date, text, text, text) to authenticated;
grant execute on function public.create_goal_contribution(uuid, uuid, numeric, timestamptz, text) to authenticated;
