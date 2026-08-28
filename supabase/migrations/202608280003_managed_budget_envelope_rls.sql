-- ============================================================
-- Migration: 202608280003_managed_budget_envelope_rls.sql
-- KASH: Managed Budget + Envelope Collaborative RLS (Phase 5A.3c1)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Performance Indexes for space_id lookups
-- ------------------------------------------------------------
create index if not exists idx_budgets_space_id on public.budgets(space_id);
create index if not exists idx_envelopes_space_id on public.envelopes(space_id);

-- ------------------------------------------------------------
-- 2. Budgets RLS Policy Cleanup & Policies
-- ------------------------------------------------------------

-- Drop legacy and existing budget policies
drop policy if exists "Users can view their own budgets" on public.budgets;
drop policy if exists "Users can view own budgets" on public.budgets;
drop policy if exists "Users can view budgets" on public.budgets;

drop policy if exists "Users can insert their own budgets" on public.budgets;
drop policy if exists "Users can insert own budgets" on public.budgets;
drop policy if exists "Users can insert budgets" on public.budgets;

drop policy if exists "Users can update their own budgets" on public.budgets;
drop policy if exists "Users can update own budgets" on public.budgets;
drop policy if exists "Users can update budgets" on public.budgets;

drop policy if exists "Users can delete their own budgets" on public.budgets;
drop policy if exists "Users can delete own budgets" on public.budgets;
drop policy if exists "Users can delete budgets" on public.budgets;

-- Budgets SELECT Policy
-- Personal: owner only
-- Managed: active owner/admin/member/viewer via user_has_managed_space_access(space_id)
create policy "Users can view budgets" on public.budgets
for select using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_access(space_id))
);

-- Budgets INSERT Policy
-- Personal: owner only
-- Managed: active owner or admin
create policy "Users can insert budgets" on public.budgets
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

-- Budgets UPDATE Policy
-- Personal: owner only
-- Managed: active owner or admin
create policy "Users can update budgets" on public.budgets
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

-- Budgets DELETE Policy
-- Personal: owner only
-- Managed: active owner or admin
create policy "Users can delete budgets" on public.budgets
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
-- 3. Budget Versions RLS Policy Cleanup & Policies
-- ------------------------------------------------------------

drop policy if exists "Users can view their own budget versions" on public.budget_versions;
drop policy if exists "Users can view own budget versions" on public.budget_versions;
drop policy if exists "Users can view budget versions" on public.budget_versions;

drop policy if exists "Users can insert their own budget versions" on public.budget_versions;
drop policy if exists "Users can insert own budget versions" on public.budget_versions;
drop policy if exists "Users can insert budget versions" on public.budget_versions;

drop policy if exists "Users can update their own budget versions" on public.budget_versions;
drop policy if exists "Users can update own budget versions" on public.budget_versions;
drop policy if exists "Users can update budget versions" on public.budget_versions;

drop policy if exists "Users can delete their own budget versions" on public.budget_versions;
drop policy if exists "Users can delete own budget versions" on public.budget_versions;
drop policy if exists "Users can delete budget versions" on public.budget_versions;

-- Budget Versions SELECT Policy
create policy "Users can view budget versions" on public.budget_versions
for select using (
  exists (
    select 1 from public.budgets b
    where b.id = budget_id
      and (
        (b.user_id = auth.uid() and b.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (b.space_id is not null and public.user_has_managed_space_access(b.space_id))
      )
  )
);

-- Budget Versions INSERT Policy
create policy "Users can insert budget versions" on public.budget_versions
for insert with check (
  exists (
    select 1 from public.budgets b
    where b.id = budget_id
      and (
        (b.user_id = auth.uid() and b.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (b.space_id is not null and public.user_has_managed_space_role(b.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

-- Budget Versions UPDATE Policy
create policy "Users can update budget versions" on public.budget_versions
for update using (
  exists (
    select 1 from public.budgets b
    where b.id = budget_id
      and (
        (b.user_id = auth.uid() and b.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (b.space_id is not null and public.user_has_managed_space_role(b.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

-- Budget Versions DELETE Policy
create policy "Users can delete budget versions" on public.budget_versions
for delete using (
  exists (
    select 1 from public.budgets b
    where b.id = budget_id
      and (
        (b.user_id = auth.uid() and b.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (b.space_id is not null and public.user_has_managed_space_role(b.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);


-- ------------------------------------------------------------
-- 4. Budget Envelope Categories RLS Policy Cleanup & Policies
-- ------------------------------------------------------------

drop policy if exists "Users can view their envelope categories" on public.budget_envelope_categories;
drop policy if exists "Users can view envelope categories" on public.budget_envelope_categories;
drop policy if exists "Users can manage their envelope categories" on public.budget_envelope_categories;
drop policy if exists "Users can manage envelope categories" on public.budget_envelope_categories;

-- Budget Envelope Categories SELECT Policy
create policy "Users can view envelope categories" on public.budget_envelope_categories
for select using (
  exists (
    select 1 from public.budgets b
    where b.id = envelope_id
      and (
        (b.user_id = auth.uid() and b.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (b.space_id is not null and public.user_has_managed_space_access(b.space_id))
      )
  )
);

-- Budget Envelope Categories WRITE Policy (ALL)
create policy "Users can manage envelope categories" on public.budget_envelope_categories
for all using (
  exists (
    select 1 from public.budgets b
    where b.id = envelope_id
      and (
        (b.user_id = auth.uid() and b.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (b.space_id is not null and public.user_has_managed_space_role(b.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);


-- ------------------------------------------------------------
-- 5. Envelopes RLS Policy Cleanup & Policies
-- ------------------------------------------------------------

-- Drop legacy and existing envelope policies
drop policy if exists "Users can view own envelopes" on public.envelopes;
drop policy if exists "Users can view their own envelopes" on public.envelopes;
drop policy if exists "Users can view envelopes" on public.envelopes;

drop policy if exists "Users can insert own envelopes" on public.envelopes;
drop policy if exists "Users can insert their own envelopes" on public.envelopes;
drop policy if exists "Users can insert envelopes" on public.envelopes;

drop policy if exists "Users can update own envelopes" on public.envelopes;
drop policy if exists "Users can update their own envelopes" on public.envelopes;
drop policy if exists "Users can update envelopes" on public.envelopes;

drop policy if exists "Users can delete own envelopes" on public.envelopes;
drop policy if exists "Users can delete their own envelopes" on public.envelopes;
drop policy if exists "Users can delete envelopes" on public.envelopes;

-- Envelopes SELECT Policy
-- Personal: owner only
-- Managed: active owner/admin/member/viewer via user_has_managed_space_access(space_id)
create policy "Users can view envelopes" on public.envelopes
for select using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_access(space_id))
);

-- Envelopes INSERT Policy
-- Personal: owner only
-- Managed: active owner or admin
create policy "Users can insert envelopes" on public.envelopes
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

-- Envelopes UPDATE Policy
-- Personal: owner only
-- Managed: active owner or admin
create policy "Users can update envelopes" on public.envelopes
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

-- Envelopes DELETE Policy
-- Personal: owner only
-- Managed: active owner or admin
create policy "Users can delete envelopes" on public.envelopes
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
-- 6. Update create_budget_target RPC for Managed Space Role Check
-- ------------------------------------------------------------

create or replace function public.create_budget_target(
  p_name text,
  p_target_type text,
  p_amount numeric,
  p_start_period date,
  p_repeat_monthly boolean default true,
  p_rollover_enabled boolean default false,
  p_category_id uuid default null,
  p_envelope_id uuid default null,
  p_counterparty_id uuid default null,
  p_debt_id uuid default null,
  p_goal_id uuid default null,
  p_wallet_id uuid default null,
  p_note text default null,
  p_space_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_space_id uuid;
  v_budget_id uuid;
  v_norm_period date;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_space_id is null then
    select id into v_space_id
    from public.financial_spaces
    where owner_user_id = v_user_id and space_type = 'personal'
    limit 1;
  else
    v_space_id := p_space_id;
  end if;

  -- Authorization check: Personal space must be owned by user; Managed space requires active owner or admin role
  if not (
    (exists (select 1 from public.financial_spaces where id = v_space_id and owner_user_id = v_user_id and space_type = 'personal'))
    or
    (public.user_has_managed_space_role(v_space_id, array['owner', 'admin']::public.managed_space_role[]))
  ) then
    raise exception 'Unauthorized';
  end if;

  v_norm_period := date_trunc('month', p_start_period)::date;

  if p_amount <= 0 then
    raise exception 'Nominal budget harus lebih besar dari 0.';
  end if;

  if p_target_type = 'category' and p_category_id is null then
    raise exception 'Kategori pengeluaran wajib dipilih.';
  elsif p_target_type = 'envelope' and p_envelope_id is null then
    raise exception 'Amplop wajib dipilih.';
  elsif p_target_type = 'goal' and p_goal_id is null and p_wallet_id is null then
    raise exception 'Pos Tabungan atau Kantong Tabungan wajib dipilih.';
  end if;

  insert into public.budgets (
    user_id,
    space_id,
    name,
    type,
    target_type,
    category_id,
    envelope_id,
    counterparty_id,
    debt_id,
    goal_id,
    wallet_id,
    start_period,
    repeat_monthly,
    note
  ) values (
    v_user_id,
    v_space_id,
    trim(p_name),
    case when p_target_type = 'envelope' then 'envelope' else 'category' end,
    p_target_type,
    p_category_id,
    p_envelope_id,
    p_counterparty_id,
    p_debt_id,
    p_goal_id,
    p_wallet_id,
    v_norm_period,
    coalesce(p_repeat_monthly, true),
    trim(p_note)
  ) returning id into v_budget_id;

  insert into public.budget_versions (
    budget_id,
    user_id,
    effective_from_period,
    amount,
    rollover_enabled
  ) values (
    v_budget_id,
    v_user_id,
    v_norm_period,
    p_amount,
    coalesce(p_rollover_enabled, false)
  );

  return v_budget_id;
end;
$$;
