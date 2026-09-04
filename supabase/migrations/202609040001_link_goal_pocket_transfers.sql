-- Treat a direct transfer into a personal Goal Pocket as a goal contribution.
-- This keeps the Goal history and any monthly budget linked to that Goal in sync.

create or replace function public.capture_goal_pocket_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal public.goals;
  v_contribution_id uuid;
begin
  if new.type <> 'transfer'
    or new.status <> 'completed'
    or new.destination_wallet_id is null
    or new.related_entity_type is not null then
    return new;
  end if;

  select *
  into v_goal
  from public.goals
  where wallet_id = new.destination_wallet_id
    and user_id = new.user_id
    and space_id is not distinct from new.space_id
    and status <> 'cancelled'
  limit 1;

  if v_goal.id is null then
    return new;
  end if;

  insert into public.goal_contributions (
    goal_id,
    user_id,
    wallet_id,
    transaction_id,
    amount,
    contribution_date,
    note
  )
  values (
    v_goal.id,
    new.user_id,
    new.wallet_id,
    new.id,
    new.amount,
    new.transaction_date,
    new.note
  )
  returning id into v_contribution_id;

  update public.transactions
  set related_entity_type = 'goal_contribution',
      related_entity_id = v_contribution_id
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists transactions_capture_goal_pocket_transfer on public.transactions;
create trigger transactions_capture_goal_pocket_transfer
after insert on public.transactions
for each row execute function public.capture_goal_pocket_transfer();

-- Backfill completed direct transfers that already went into an active personal
-- Goal Pocket, including transfers created before this trigger was introduced.
with goal_pocket_transfers as (
  select
    t.id as transaction_id,
    g.id as goal_id,
    t.user_id,
    t.wallet_id,
    t.amount,
    t.transaction_date,
    t.note
  from public.transactions t
  join public.goals g
    on g.wallet_id = t.destination_wallet_id
    and g.user_id = t.user_id
    and g.space_id is not distinct from t.space_id
  where t.type = 'transfer'
    and t.status = 'completed'
    and t.related_entity_type is null
    and g.status <> 'cancelled'
    and not exists (
      select 1
      from public.goal_contributions gc
      where gc.transaction_id = t.id
    )
), inserted_contributions as (
  insert into public.goal_contributions (
    goal_id,
    user_id,
    wallet_id,
    transaction_id,
    amount,
    contribution_date,
    note
  )
  select
    goal_id,
    user_id,
    wallet_id,
    transaction_id,
    amount,
    transaction_date,
    note
  from goal_pocket_transfers
  returning id, transaction_id
)
update public.transactions t
set related_entity_type = 'goal_contribution',
    related_entity_id = ic.id
from inserted_contributions ic
where t.id = ic.transaction_id;
