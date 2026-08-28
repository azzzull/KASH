-- ============================================================
-- Migration: 202608280005_managed_debt_collaboration_rls.sql
-- KASH: Managed Debt Collaboration RLS
-- ============================================================

-- ------------------------------------------------------------
-- 1. Performance Indexes for space_id lookups
-- ------------------------------------------------------------
create index if not exists idx_counterparties_space_id on public.counterparties(space_id);
create index if not exists idx_debts_space_id on public.debts(space_id);

-- ------------------------------------------------------------
-- 2. Counterparties Table RLS Policies
-- ------------------------------------------------------------
drop policy if exists "Users can manage own counterparties" on public.counterparties;
drop policy if exists "Users can view counterparties" on public.counterparties;
drop policy if exists "Users can insert counterparties" on public.counterparties;
drop policy if exists "Users can update counterparties" on public.counterparties;
drop policy if exists "Users can delete counterparties" on public.counterparties;

create policy "Users can view counterparties" on public.counterparties
for select using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_access(space_id))
);

create policy "Users can insert counterparties" on public.counterparties
for insert with check (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[]))
);

create policy "Users can update counterparties" on public.counterparties
for update using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[]))
);

create policy "Users can delete counterparties" on public.counterparties
for delete using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[]))
);

-- ------------------------------------------------------------
-- 3. Debts Table RLS Policies
-- ------------------------------------------------------------
drop policy if exists "Users can manage own debts" on public.debts;
drop policy if exists "Users can view debts" on public.debts;
drop policy if exists "Users can insert debts" on public.debts;
drop policy if exists "Users can update debts" on public.debts;
drop policy if exists "Users can delete debts" on public.debts;

create policy "Users can view debts" on public.debts
for select using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_access(space_id))
);

create policy "Users can insert debts" on public.debts
for insert with check (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[]))
);

create policy "Users can update debts" on public.debts
for update using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[]))
);

create policy "Users can delete debts" on public.debts
for delete using (
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
  or
  (space_id is not null and public.user_has_managed_space_role(space_id, array['owner', 'admin']::public.managed_space_role[]))
);

-- ------------------------------------------------------------
-- 4. Debt Payments RLS Policies (Derived from Counterparty)
-- ------------------------------------------------------------
drop policy if exists "Users can manage own debt payments" on public.debt_payments;
drop policy if exists "Users can view debt payments" on public.debt_payments;
drop policy if exists "Users can insert debt payments" on public.debt_payments;
drop policy if exists "Users can update debt payments" on public.debt_payments;
drop policy if exists "Users can delete debt payments" on public.debt_payments;

create policy "Users can view debt payments" on public.debt_payments
for select using (
  exists (
    select 1 from public.counterparties c
    where c.id = debt_payments.counterparty_id
      and (
        (c.user_id = auth.uid() and c.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (c.space_id is not null and public.user_has_managed_space_access(c.space_id))
      )
  )
);

create policy "Users can insert debt payments" on public.debt_payments
for insert with check (
  exists (
    select 1 from public.counterparties c
    where c.id = debt_payments.counterparty_id
      and (
        (c.user_id = auth.uid() and c.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (c.space_id is not null and public.user_has_managed_space_role(c.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

create policy "Users can update debt payments" on public.debt_payments
for update using (
  exists (
    select 1 from public.counterparties c
    where c.id = debt_payments.counterparty_id
      and (
        (c.user_id = auth.uid() and c.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (c.space_id is not null and public.user_has_managed_space_role(c.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

create policy "Users can delete debt payments" on public.debt_payments
for delete using (
  exists (
    select 1 from public.counterparties c
    where c.id = debt_payments.counterparty_id
      and (
        (c.user_id = auth.uid() and c.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (c.space_id is not null and public.user_has_managed_space_role(c.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

-- ------------------------------------------------------------
-- 5. Debt Payment Allocations RLS Policies (Derived from Debt)
-- ------------------------------------------------------------
drop policy if exists "Users can manage own debt payment allocations" on public.debt_payment_allocations;
drop policy if exists "Users can view debt payment allocations" on public.debt_payment_allocations;
drop policy if exists "Users can insert debt payment allocations" on public.debt_payment_allocations;
drop policy if exists "Users can update debt payment allocations" on public.debt_payment_allocations;
drop policy if exists "Users can delete debt payment allocations" on public.debt_payment_allocations;

create policy "Users can view debt payment allocations" on public.debt_payment_allocations
for select using (
  exists (
    select 1 from public.debts d
    where d.id = debt_payment_allocations.debt_id
      and (
        (d.user_id = auth.uid() and d.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (d.space_id is not null and public.user_has_managed_space_access(d.space_id))
      )
  )
);

create policy "Users can insert debt payment allocations" on public.debt_payment_allocations
for insert with check (
  exists (
    select 1 from public.debts d
    where d.id = debt_payment_allocations.debt_id
      and (
        (d.user_id = auth.uid() and d.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (d.space_id is not null and public.user_has_managed_space_role(d.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

create policy "Users can update debt payment allocations" on public.debt_payment_allocations
for update using (
  exists (
    select 1 from public.debts d
    where d.id = debt_payment_allocations.debt_id
      and (
        (d.user_id = auth.uid() and d.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (d.space_id is not null and public.user_has_managed_space_role(d.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);

create policy "Users can delete debt payment allocations" on public.debt_payment_allocations
for delete using (
  exists (
    select 1 from public.debts d
    where d.id = debt_payment_allocations.debt_id
      and (
        (d.user_id = auth.uid() and d.space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
        or
        (d.space_id is not null and public.user_has_managed_space_role(d.space_id, array['owner', 'admin']::public.managed_space_role[]))
      )
  )
);
