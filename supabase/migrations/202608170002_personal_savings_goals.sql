do $$
begin
  if not exists (select 1 from pg_type where typname = 'goal_status') then
    create type public.goal_status as enum ('active', 'completed', 'cancelled');
  end if;
end $$;

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  target_amount numeric(18,2) not null,
  deadline date,
  icon text,
  image_url text,
  note text,
  status public.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_name_not_blank check (length(trim(name)) > 0),
  constraint goals_target_amount_positive check (target_amount > 0)
);

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id),
  amount numeric(18,2) not null,
  contribution_date timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  constraint goal_contributions_amount_positive check (amount > 0)
);

create index if not exists goals_user_status_idx on public.goals(user_id, status);
create index if not exists goals_deadline_idx on public.goals(deadline);
create index if not exists goal_contributions_goal_date_idx on public.goal_contributions(goal_id, contribution_date desc);
create index if not exists goal_contributions_user_wallet_idx on public.goal_contributions(user_id, wallet_id);

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

create or replace function public.validate_goal_contribution_relationships()
returns trigger
language plpgsql
as $$
declare
  goal_owner_id uuid;
  goal_state public.goal_status;
  wallet_owner_id uuid;
begin
  select user_id, status
  into goal_owner_id, goal_state
  from public.goals
  where id = new.goal_id;

  if goal_owner_id is null or goal_owner_id <> new.user_id then
    raise exception 'Goal must belong to the contribution user.';
  end if;

  if goal_state = 'cancelled' then
    raise exception 'Cancelled goals cannot receive contributions.';
  end if;

  select user_id
  into wallet_owner_id
  from public.wallets
  where id = new.wallet_id;

  if wallet_owner_id is null or wallet_owner_id <> new.user_id then
    raise exception 'Contribution wallet must belong to the contribution user.';
  end if;

  return new;
end;
$$;

drop trigger if exists goal_contributions_validate_relationships on public.goal_contributions;
create trigger goal_contributions_validate_relationships
before insert or update on public.goal_contributions
for each row execute function public.validate_goal_contribution_relationships();

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
),
goal_allocations as (
  select
    gc.wallet_id,
    coalesce(sum(gc.amount), 0)::numeric(18,2) as allocated_to_goals
  from public.goal_contributions gc
  join public.goals g on g.id = gc.goal_id
  where g.status in ('active', 'completed')
  group by gc.wallet_id
)
select
  w.id as wallet_id,
  w.user_id,
  w.initial_balance,
  coalesce(tt.transaction_total, 0)::numeric(18,2) as transaction_total,
  (w.initial_balance + coalesce(tt.transaction_total, 0))::numeric(18,2) as current_balance,
  coalesce(ga.allocated_to_goals, 0)::numeric(18,2) as allocated_to_goals,
  (w.initial_balance + coalesce(tt.transaction_total, 0) - coalesce(ga.allocated_to_goals, 0))::numeric(18,2) as available_balance
from public.wallets w
left join transaction_totals tt on tt.wallet_id = w.id
left join goal_allocations ga on ga.wallet_id = w.id;

create or replace view public.goal_progress_view
with (security_invoker = true) as
select
  g.id as goal_id,
  g.user_id,
  g.target_amount,
  coalesce(sum(gc.amount), 0)::numeric(18,2) as current_amount,
  greatest((g.target_amount - coalesce(sum(gc.amount), 0)), 0)::numeric(18,2) as remaining_amount,
  case
    when g.target_amount > 0 then least((coalesce(sum(gc.amount), 0) / g.target_amount) * 100, 100)
    else 0
  end::numeric(8,2) as percentage
from public.goals g
left join public.goal_contributions gc on gc.goal_id = g.id
group by g.id, g.user_id, g.target_amount;

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
  wallet_current_balance numeric(18,2);
  wallet_allocated numeric(18,2);
  wallet_available numeric(18,2);
  created_contribution public.goal_contributions;
begin
  if current_user_id is null then
    raise exception 'You need to be signed in to add a goal contribution.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Contribution amount must be greater than zero.';
  end if;

  perform 1
  from public.goals
  where id = p_goal_id
    and user_id = current_user_id
    and status <> 'cancelled'
  for update;

  if not found then
    raise exception 'Goal not found or cannot receive contributions.';
  end if;

  perform 1
  from public.wallets
  where id = p_wallet_id
    and user_id = current_user_id
    and is_archived = false
  for update;

  if not found then
    raise exception 'Wallet not found or archived.';
  end if;

  select current_balance, allocated_to_goals, available_balance
  into wallet_current_balance, wallet_allocated, wallet_available
  from public.wallet_balance_view
  where wallet_id = p_wallet_id
    and user_id = current_user_id;

  if wallet_available is null then
    wallet_available := 0;
  end if;

  if p_amount > wallet_available then
    raise exception 'Contribution exceeds available wallet balance.';
  end if;

  insert into public.goal_contributions (goal_id, user_id, wallet_id, amount, contribution_date, note)
  values (p_goal_id, current_user_id, p_wallet_id, p_amount, coalesce(p_contribution_date, now()), nullif(trim(p_note), ''))
  returning * into created_contribution;

  return created_contribution;
end;
$$;

alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

drop policy if exists "Users can read own goals" on public.goals;
create policy "Users can read own goals"
on public.goals for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own goals" on public.goals;
create policy "Users can create own goals"
on public.goals for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own goals" on public.goals;
create policy "Users can update own goals"
on public.goals for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own goal contributions" on public.goal_contributions;
create policy "Users can read own goal contributions"
on public.goal_contributions for select
to authenticated
using (auth.uid() = user_id);

grant select on public.wallet_balance_view to authenticated;
grant select on public.goal_progress_view to authenticated;
grant execute on function public.create_goal_contribution(uuid, uuid, numeric, timestamptz, text) to authenticated;
