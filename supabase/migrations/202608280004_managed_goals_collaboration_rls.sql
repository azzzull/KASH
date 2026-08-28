-- ============================================================
-- Migration: 202608280004_managed_goals_collaboration_rls.sql
-- KASH: Managed Goals Collaboration RLS (Phase 5A.3c2)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Performance Indexes for space_id lookups
-- ------------------------------------------------------------
create index if not exists idx_goals_space_id on public.goals(space_id);

-- ------------------------------------------------------------
-- 2. Goals Table RLS Policies
-- ------------------------------------------------------------

drop policy if exists "Users can read own goals" on public.goals;
drop policy if exists "Users can view own goals" on public.goals;
drop policy if exists "Users can view goals" on public.goals;

drop policy if exists "Users can create own goals" on public.goals;
drop policy if exists "Users can insert own goals" on public.goals;
drop policy if exists "Users can insert goals" on public.goals;

drop policy if exists "Users can update own goals" on public.goals;
drop policy if exists "Users can update goals" on public.goals;

drop policy if exists "Users can delete own goals" on public.goals;
drop policy if exists "Users can delete goals" on public.goals;

-- Goals SELECT Policy
-- Personal Space: owner only
-- Managed Space: active owner/admin/member/viewer via user_has_managed_space_access(space_id)
create policy "Users can view goals" on public.goals
for select using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_access(space_id))
);

-- Goals INSERT Policy
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can insert goals" on public.goals
for insert with check (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: active owner or admin
    user_id = auth.uid()
    and space_id is not null
    and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
  )
);

-- Goals UPDATE Policy
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can update goals" on public.goals
for update using (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: active owner or admin
    space_id is not null
    and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
  )
);

-- Goals DELETE Policy
-- Personal Space: owner only
-- Managed Space: active owner or admin
create policy "Users can delete goals" on public.goals
for delete using (
  (
    -- Personal Space: owner only
    user_id = auth.uid()
    and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
  )
  or
  (
    -- Managed Space: active owner or admin
    space_id is not null
    and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[])
  )
);


-- ------------------------------------------------------------
-- 3. Goal Contributions Table RLS Policies
-- ------------------------------------------------------------

drop policy if exists "Users can read own goal contributions" on public.goal_contributions;
drop policy if exists "Users can view own goal contributions" on public.goal_contributions;
drop policy if exists "Users can view goal contributions" on public.goal_contributions;

drop policy if exists "Users can create own goal contributions" on public.goal_contributions;
drop policy if exists "Users can insert own goal contributions" on public.goal_contributions;
drop policy if exists "Users can insert goal contributions" on public.goal_contributions;

drop policy if exists "Users can update own goal contributions" on public.goal_contributions;
drop policy if exists "Users can update goal contributions" on public.goal_contributions;

drop policy if exists "Users can delete own goal contributions" on public.goal_contributions;
drop policy if exists "Users can delete goal contributions" on public.goal_contributions;

-- Goal Contributions SELECT Policy
create policy "Users can view goal contributions" on public.goal_contributions
for select using (
  exists (
    select 1 from public.goals g
    where g.id = goal_id
      and (
        (g.user_id = auth.uid() and g.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (g.space_id is not null and public.user_has_managed_space_access(g.space_id))
      )
  )
);

-- Goal Contributions INSERT Policy
create policy "Users can insert goal contributions" on public.goal_contributions
for insert with check (
  exists (
    select 1 from public.goals g
    where g.id = goal_id
      and (
        (g.user_id = auth.uid() and g.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (g.space_id is not null and public.user_has_managed_space_role(g.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

-- Goal Contributions UPDATE Policy
create policy "Users can update goal contributions" on public.goal_contributions
for update using (
  exists (
    select 1 from public.goals g
    where g.id = goal_id
      and (
        (g.user_id = auth.uid() and g.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (g.space_id is not null and public.user_has_managed_space_role(g.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

-- Goal Contributions DELETE Policy
create policy "Users can delete goal contributions" on public.goal_contributions
for delete using (
  exists (
    select 1 from public.goals g
    where g.id = goal_id
      and (
        (g.user_id = auth.uid() and g.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (g.space_id is not null and public.user_has_managed_space_role(g.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);


-- ------------------------------------------------------------
-- 4. Update Trigger Function: validate_goal_contribution_relationships
-- ------------------------------------------------------------

create or replace function public.validate_goal_contribution_relationships()
returns trigger
language plpgsql
as $$
declare
  goal_rec public.goals;
  wallet_rec public.wallets;
  transaction_record public.transactions;
begin
  select *
  into goal_rec
  from public.goals
  where id = new.goal_id;

  if goal_rec.id is null then
    raise exception 'Goal not found.';
  end if;

  if not (
    (goal_rec.user_id = new.user_id and goal_rec.space_id in (select id from public.financial_spaces where owner_user_id = new.user_id))
    or
    (goal_rec.space_id is not null and public.user_has_managed_space_role(goal_rec.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Goal must belong to the user personal space or active managed space.';
  end if;

  if goal_rec.status = 'cancelled' then
    raise exception 'Cancelled goals cannot receive contributions.';
  end if;

  if goal_rec.wallet_id is null then
    raise exception 'Goal must have a linked pocket wallet.';
  end if;

  select *
  into wallet_rec
  from public.wallets
  where id = new.wallet_id;

  if wallet_rec.id is null then
    raise exception 'Contribution source wallet not found.';
  end if;

  if not (
    (wallet_rec.user_id = new.user_id and wallet_rec.space_id in (select id from public.financial_spaces where owner_user_id = new.user_id))
    or
    (wallet_rec.space_id is not null and public.user_has_managed_space_role(wallet_rec.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Contribution source wallet must belong to the user personal space or active managed space.';
  end if;

  if wallet_rec.space_id <> goal_rec.space_id then
    raise exception 'Contribution source wallet and goal must be in the same space.';
  end if;

  if new.wallet_id = goal_rec.wallet_id then
    raise exception 'Contribution source wallet must be different from the goal pocket.';
  end if;

  if new.transaction_id is not null then
    select *
    into transaction_record
    from public.transactions
    where id = new.transaction_id;

    if transaction_record.id is null
      or transaction_record.space_id <> goal_rec.space_id
      or transaction_record.type <> 'transfer'
      or transaction_record.status <> 'completed'
      or transaction_record.wallet_id <> new.wallet_id
      or transaction_record.destination_wallet_id <> goal_rec.wallet_id
      or transaction_record.amount <> new.amount then
      raise exception 'Goal contribution transaction must be a matching completed transfer to the goal pocket.';
    end if;
  end if;

  return new;
end;
$$;


-- ------------------------------------------------------------
-- 5. Update Goal Management RPCs with Managed Space Roles
-- ------------------------------------------------------------

create or replace function public.create_goal_with_pocket(
  p_name text,
  p_target_amount numeric,
  p_deadline date default null,
  p_icon text default null,
  p_note text default null,
  p_pocket_institution text default null,
  p_space_id uuid default null
)
returns public.goals
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_space_id uuid;
  default_currency char(3);
  new_goal_id uuid := gen_random_uuid();
  pocket_wallet_id uuid;
  created_goal public.goals;
begin
  if current_user_id is null then
    raise exception 'You need to be signed in to create a goal.';
  end if;

  if p_space_id is null then
    select id into target_space_id
    from public.financial_spaces
    where owner_user_id = current_user_id and space_type = 'personal'
    limit 1;
  else
    target_space_id := p_space_id;
  end if;

  -- Validate space permissions: Personal owner OR Managed owner/admin
  if not (
    (exists (select 1 from public.financial_spaces where id = target_space_id and owner_user_id = current_user_id and space_type = 'personal'))
    or
    (public.user_has_managed_space_role(target_space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Unauthorized';
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
    space_id,
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
    target_space_id,
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
    space_id,
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
    target_space_id,
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

create or replace function public.archive_goal(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal_record public.goals;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  
  select * into v_goal_record from public.goals where id = p_goal_id for update;
  if v_goal_record.id is null then raise exception 'Goal not found'; end if;
  
  if not (
    (v_goal_record.user_id = v_user_id and v_goal_record.space_id in (select id from public.financial_spaces where owner_user_id = v_user_id))
    or
    (v_goal_record.space_id is not null and public.user_has_managed_space_role(v_goal_record.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Unauthorized';
  end if;

  update public.goals set is_archived = true, updated_at = now() where id = p_goal_id;
end;
$$;

create or replace function public.unarchive_goal(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal_record public.goals;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  
  select * into v_goal_record from public.goals where id = p_goal_id for update;
  if v_goal_record.id is null then raise exception 'Goal not found'; end if;
  
  if not (
    (v_goal_record.user_id = v_user_id and v_goal_record.space_id in (select id from public.financial_spaces where owner_user_id = v_user_id))
    or
    (v_goal_record.space_id is not null and public.user_has_managed_space_role(v_goal_record.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Unauthorized';
  end if;

  update public.goals set is_archived = false, updated_at = now() where id = p_goal_id;
end;
$$;

create or replace function public.delete_goal_if_empty(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal_record public.goals;
  v_contributions_count integer;
  v_refunds_count integer;
  v_pocket_wallet_id uuid;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  
  select * into v_goal_record from public.goals where id = p_goal_id for update;
  if v_goal_record.id is null then raise exception 'Goal not found'; end if;

  if not (
    (v_goal_record.user_id = v_user_id and v_goal_record.space_id in (select id from public.financial_spaces where owner_user_id = v_user_id))
    or
    (v_goal_record.space_id is not null and public.user_has_managed_space_role(v_goal_record.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Unauthorized';
  end if;

  select count(*) into v_contributions_count from public.goal_contributions where goal_id = p_goal_id;
  if v_contributions_count > 0 then
    raise exception 'Goal cannot be deleted because it has contribution history. Please cancel it instead.';
  end if;

  select count(*) into v_refunds_count from public.transactions where related_entity_type = 'goal_refund' and related_entity_id = p_goal_id;
  if v_refunds_count > 0 then
    raise exception 'Goal cannot be deleted because it has refund history. Please cancel it instead.';
  end if;

  v_pocket_wallet_id := v_goal_record.wallet_id;

  if v_pocket_wallet_id is not null then
    update public.goals set wallet_id = null where id = p_goal_id;
  end if;

  delete from public.goals where id = p_goal_id;

  if v_pocket_wallet_id is not null then
    perform public.delete_wallet_permanently(v_pocket_wallet_id);
  end if;
end;
$$;

create or replace function public.close_goal_with_sweep(
  p_goal_id uuid,
  p_destination_wallet_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  goal_record public.goals;
  pocket_wallet_record public.wallets;
  dest_wallet_record public.wallets;
  pocket_balance numeric(18,2);
  created_transaction_id uuid := null;
begin
  if current_user_id is null then
    raise exception 'You need to be signed in to close a goal.';
  end if;

  select *
  into goal_record
  from public.goals
  where id = p_goal_id
  for update;

  if goal_record.id is null then
    raise exception 'Goal not found.';
  end if;

  if not (
    (goal_record.user_id = current_user_id and goal_record.space_id in (select id from public.financial_spaces where owner_user_id = current_user_id))
    or
    (goal_record.space_id is not null and public.user_has_managed_space_role(goal_record.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Unauthorized';
  end if;

  if goal_record.wallet_id is null then
    raise exception 'Goal does not have a linked pocket wallet.';
  end if;

  select *
  into pocket_wallet_record
  from public.wallets
  where id = goal_record.wallet_id
  for update;

  if pocket_wallet_record.id is null then
    raise exception 'Goal pocket wallet not found.';
  end if;

  select coalesce(current_balance, 0)
  into pocket_balance
  from public.wallet_balance_view
  where wallet_id = goal_record.wallet_id;

  if pocket_balance is null then
    pocket_balance := 0;
  end if;

  -- If it's already cancelled and has 0 balance, it's fully closed
  if goal_record.status = 'cancelled' and pocket_balance <= 0 then
    raise exception 'Goal is already cancelled and has no remaining balance.';
  end if;

  if pocket_balance > 0 then
    if p_destination_wallet_id is null then
      raise exception 'A destination wallet is required to transfer the remaining balance of %.', pocket_balance;
    end if;

    if p_destination_wallet_id = goal_record.wallet_id then
      raise exception 'Destination wallet cannot be the goal pocket itself.';
    end if;

    select *
    into dest_wallet_record
    from public.wallets
    where id = p_destination_wallet_id
      and is_archived = false
    for update;

    if dest_wallet_record.id is null then
      raise exception 'Destination wallet not found or is archived.';
    end if;

    -- Destination wallet must belong to the same space
    if dest_wallet_record.space_id <> goal_record.space_id then
      raise exception 'Destination wallet must be in the same space as the goal.';
    end if;

    if not (
      (dest_wallet_record.user_id = current_user_id and dest_wallet_record.space_id in (select id from public.financial_spaces where owner_user_id = current_user_id))
      or
      (dest_wallet_record.space_id is not null and public.user_has_managed_space_role(dest_wallet_record.space_id, array['owner', 'admin']::public.managed_space_role[]))
    ) then
      raise exception 'Unauthorized for destination wallet.';
    end if;

    insert into public.transactions (
      user_id,
      space_id,
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
      goal_record.space_id,
      'transfer',
      pocket_balance,
      goal_record.wallet_id,
      dest_wallet_record.id,
      0,
      now(),
      'Goal Refund: ' || goal_record.name,
      'Remaining balance returned',
      'completed',
      'goal_refund',
      goal_record.id
    )
    returning id into created_transaction_id;
  end if;

  if goal_record.status <> 'cancelled' then
    update public.goals
    set status = 'cancelled',
        updated_at = now()
    where id = goal_record.id;
  end if;

  if not pocket_wallet_record.is_archived then
    update public.wallets
    set is_archived = true,
        updated_at = now()
    where id = goal_record.wallet_id;
  end if;

  return jsonb_build_object(
    'goal_id', goal_record.id,
    'status', 'cancelled',
    'swept_amount', pocket_balance,
    'destination_wallet_id', p_destination_wallet_id,
    'transaction_id', created_transaction_id
  );
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
  source_wallet_record public.wallets;
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
    and status <> 'cancelled'
  for update;

  if goal_record.id is null or goal_record.wallet_id is null then
    raise exception 'Goal not found or has no pocket wallet.';
  end if;

  if not (
    (goal_record.user_id = current_user_id and goal_record.space_id in (select id from public.financial_spaces where owner_user_id = current_user_id))
    or
    (goal_record.space_id is not null and public.user_has_managed_space_role(goal_record.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Unauthorized for goal.';
  end if;

  select *
  into source_wallet_record
  from public.wallets
  where id = p_wallet_id
    and is_archived = false
  for update;

  if source_wallet_record.id is null then
    raise exception 'Source wallet not found or archived.';
  end if;

  if source_wallet_record.space_id <> goal_record.space_id then
    raise exception 'Source wallet and goal must belong to the same space.';
  end if;

  if not (
    (source_wallet_record.user_id = current_user_id and source_wallet_record.space_id in (select id from public.financial_spaces where owner_user_id = current_user_id))
    or
    (source_wallet_record.space_id is not null and public.user_has_managed_space_role(source_wallet_record.space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Unauthorized for source wallet.';
  end if;

  if p_wallet_id = goal_record.wallet_id then
    raise exception 'Source wallet must be different from the goal pocket.';
  end if;

  select current_balance
  into source_balance
  from public.wallet_balance_view
  where wallet_id = p_wallet_id;

  if coalesce(source_balance, 0) < p_amount then
    raise exception 'Contribution exceeds source wallet balance.';
  end if;

  insert into public.transactions (
    user_id,
    space_id,
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
    goal_record.space_id,
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
