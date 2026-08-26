-- ============================================================
-- KASH: Financial Spaces V1 Foundation & Backfill
--
-- Introduces financial_spaces to support isolated accounting
-- contexts (Personal vs Managed). Includes data backfill,
-- transactional space consistency, and complete RLS transition.
-- ============================================================

-- 1. Foundation Types & Schema
create type public.financial_space_type as enum ('personal', 'managed');

create table public.financial_spaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  space_type public.financial_space_type not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_one_personal_space_per_user on public.financial_spaces (owner_user_id) where (space_type = 'personal');

-- 2. Personal Space Lifecycle Enforcement
create or replace function public.trigger_create_personal_space()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.financial_spaces (owner_user_id, name, space_type)
  values (new.id, 'Personal Space', 'personal');
  return new;
end;
$$;

drop trigger if exists on_profile_created_create_space on public.profiles;
create trigger on_profile_created_create_space
after insert on public.profiles
for each row
execute function public.trigger_create_personal_space();

create or replace function public.protect_personal_space_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.space_type = 'personal' then
    if new.space_type <> 'personal' then
      raise exception 'Personal space type cannot be changed.';
    end if;
    if new.is_archived = true then
      raise exception 'Personal space cannot be archived.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_personal_space on public.financial_spaces;
create trigger protect_personal_space
before update on public.financial_spaces
for each row
execute function public.protect_personal_space_immutability();

-- 3. Add space_id Columns
alter table public.wallets add column space_id uuid references public.financial_spaces(id) on delete cascade;
alter table public.transactions add column space_id uuid references public.financial_spaces(id) on delete cascade;
alter table public.categories add column space_id uuid references public.financial_spaces(id) on delete cascade;
alter table public.budgets add column space_id uuid references public.financial_spaces(id) on delete cascade;
alter table public.envelopes add column space_id uuid references public.financial_spaces(id) on delete cascade;
alter table public.goals add column space_id uuid references public.financial_spaces(id) on delete cascade;
alter table public.counterparties add column space_id uuid references public.financial_spaces(id) on delete cascade;
alter table public.debts add column space_id uuid references public.financial_spaces(id) on delete cascade;
alter table public.recurring_obligations add column space_id uuid references public.financial_spaces(id) on delete cascade;

-- 4. Backfill Existing Data
insert into public.financial_spaces (owner_user_id, name, space_type)
select id, 'Personal Space', 'personal'
from public.profiles;

do $$
declare
  v_rec record;
begin
  for v_rec in (
    select unnest(array[
      'wallets', 'transactions', 'budgets', 'envelopes', 'goals', 
      'counterparties', 'debts', 'recurring_obligations'
    ]) as table_name
  )
  loop
    if v_rec.table_name = 'transactions' then
      alter table public.transactions disable trigger transactions_prevent_goal_contribution_mutation;
      alter table public.transactions disable trigger transactions_set_updated_at;
    end if;

    execute format('
      update public.%I t
      set space_id = s.id
      from public.financial_spaces s
      where s.owner_user_id = t.user_id and s.space_type = ''personal'';
    ', v_rec.table_name);

    if v_rec.table_name = 'transactions' then
      alter table public.transactions enable trigger transactions_prevent_goal_contribution_mutation;
      alter table public.transactions enable trigger transactions_set_updated_at;
    end if;
  end loop;

  update public.categories c
  set space_id = s.id
  from public.financial_spaces s
  where s.owner_user_id = c.user_id 
    and c.user_id is not null 
    and s.space_type = 'personal';
end;
$$;

-- 5. Enforce Constraints
alter table public.wallets alter column space_id set not null;
alter table public.transactions alter column space_id set not null;
alter table public.budgets alter column space_id set not null;
alter table public.envelopes alter column space_id set not null;
alter table public.goals alter column space_id set not null;
alter table public.counterparties alter column space_id set not null;
alter table public.debts alter column space_id set not null;
alter table public.recurring_obligations alter column space_id set not null;

alter table public.categories add constraint categories_space_id_system_check
check (
  (user_id is null and space_id is null) or (user_id is not null and space_id is not null)
);

-- 6. Transitional Fallback Defaults (BEFORE INSERT triggers)
create or replace function public.transitional_fallback_space_id()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.space_id is null and new.user_id is not null then
    select id into new.space_id
    from public.financial_spaces
    where owner_user_id = new.user_id and space_type = 'personal'
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists transitional_space_id_wallets on public.wallets;
create trigger transitional_space_id_wallets before insert on public.wallets for each row execute function public.transitional_fallback_space_id();
drop trigger if exists transitional_space_id_budgets on public.budgets;
create trigger transitional_space_id_budgets before insert on public.budgets for each row execute function public.transitional_fallback_space_id();
drop trigger if exists transitional_space_id_envelopes on public.envelopes;
create trigger transitional_space_id_envelopes before insert on public.envelopes for each row execute function public.transitional_fallback_space_id();
drop trigger if exists transitional_space_id_goals on public.goals;
create trigger transitional_space_id_goals before insert on public.goals for each row execute function public.transitional_fallback_space_id();
drop trigger if exists transitional_space_id_counterparties on public.counterparties;
create trigger transitional_space_id_counterparties before insert on public.counterparties for each row execute function public.transitional_fallback_space_id();
drop trigger if exists transitional_space_id_debts on public.debts;
create trigger transitional_space_id_debts before insert on public.debts for each row execute function public.transitional_fallback_space_id();
drop trigger if exists transitional_space_id_recurring_obligations on public.recurring_obligations;
create trigger transitional_space_id_recurring_obligations before insert on public.recurring_obligations for each row execute function public.transitional_fallback_space_id();

create or replace function public.transitional_fallback_space_id_categories()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.space_id is null and new.user_id is not null then
    select id into new.space_id
    from public.financial_spaces
    where owner_user_id = new.user_id and space_type = 'personal'
    limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists transitional_space_id_categories on public.categories;
create trigger transitional_space_id_categories before insert on public.categories for each row execute function public.transitional_fallback_space_id_categories();

-- 7. Transaction Space Consistency
create or replace function public.enforce_transaction_space_consistency()
returns trigger
language plpgsql
security definer
as $$
declare
  v_source_space_id uuid;
  v_dest_space_id uuid;
begin
  select space_id into v_source_space_id from public.wallets where id = new.wallet_id;
  
  if v_source_space_id is null then
    raise exception 'Wallet not found or missing space_id.';
  end if;

  if new.space_id is null then
    new.space_id := v_source_space_id;
  else
    if new.space_id <> v_source_space_id then
      raise exception 'Transaction space_id must match its source wallet space_id.';
    end if;
  end if;

  if new.type = 'transfer' and new.destination_wallet_id is not null then
    select space_id into v_dest_space_id from public.wallets where id = new.destination_wallet_id;
    if v_dest_space_id <> v_source_space_id then
      raise exception 'Internal transfers must occur within the same financial space.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_txn_space on public.transactions;
create trigger enforce_txn_space
before insert or update on public.transactions
for each row
execute function public.enforce_transaction_space_consistency();

-- 8. Safe Space Deletion & RLS
alter table public.financial_spaces enable row level security;

create policy "Users can view their own financial spaces" on public.financial_spaces
for select using (owner_user_id = auth.uid());

create policy "Users can insert their own financial spaces" on public.financial_spaces
for insert with check (owner_user_id = auth.uid());

create policy "Users can update their own financial spaces" on public.financial_spaces
for update using (owner_user_id = auth.uid());

create policy "Users cannot delete spaces via RLS directly" on public.financial_spaces
for delete using (false);

create or replace function public.delete_managed_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_type text;
  v_owner_id uuid;
  v_wallet_count int;
  v_txn_count int;
begin
  select space_type, owner_user_id into v_space_type, v_owner_id
  from public.financial_spaces
  where id = p_space_id;

  if not found then
    raise exception 'Financial Space not found.';
  end if;

  if v_owner_id <> auth.uid() then
    raise exception 'Unauthorized.';
  end if;

  if v_space_type = 'personal' then
    raise exception 'Personal space cannot be deleted.';
  end if;

  select count(*) into v_wallet_count from public.wallets where space_id = p_space_id;
  if v_wallet_count > 0 then
    raise exception 'Cannot delete space containing wallets. Archive it instead.';
  end if;

  select count(*) into v_txn_count from public.transactions where space_id = p_space_id;
  if v_txn_count > 0 then
    raise exception 'Cannot delete space containing transactions. Archive it instead.';
  end if;

  delete from public.financial_spaces where id = p_space_id;
end;
$$;

-- 9. Update Table RLS for Dual-Ownership Validation
-- Categories
drop policy if exists "Users can read own categories and system categories" on public.categories;
create policy "Users can read own categories and system categories" on public.categories
for select using (
  (user_id is null) or 
  (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
);

drop policy if exists "Users can insert own categories" on public.categories;
create policy "Users can insert own categories" on public.categories
for insert with check (
  user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid())
);

drop policy if exists "Users can update own categories" on public.categories;
create policy "Users can update own categories" on public.categories
for update using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

drop policy if exists "Users can delete own categories" on public.categories;
create policy "Users can delete own categories" on public.categories
for delete using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

-- Wallets
drop policy if exists "Users can view their own wallets" on public.wallets;
create policy "Users can view their own wallets" on public.wallets for select using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can insert their own wallets" on public.wallets;
create policy "Users can insert their own wallets" on public.wallets for insert with check (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can update their own wallets" on public.wallets;
create policy "Users can update their own wallets" on public.wallets for update using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can delete their own wallets" on public.wallets;
create policy "Users can delete their own wallets" on public.wallets for delete using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

-- Transactions
drop policy if exists "Users can view their own transactions" on public.transactions;
create policy "Users can view their own transactions" on public.transactions for select using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can insert their own transactions" on public.transactions;
create policy "Users can insert their own transactions" on public.transactions for insert with check (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can update their own transactions" on public.transactions;
create policy "Users can update their own transactions" on public.transactions for update using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can delete their own transactions" on public.transactions;
create policy "Users can delete their own transactions" on public.transactions for delete using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

-- Budgets
drop policy if exists "Users can view their own budgets" on public.budgets;
create policy "Users can view their own budgets" on public.budgets for select using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can insert their own budgets" on public.budgets;
create policy "Users can insert their own budgets" on public.budgets for insert with check (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can update their own budgets" on public.budgets;
create policy "Users can update their own budgets" on public.budgets for update using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can delete their own budgets" on public.budgets;
create policy "Users can delete their own budgets" on public.budgets for delete using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

-- Envelopes
drop policy if exists "Users can view own envelopes" on public.envelopes;
create policy "Users can view own envelopes" on public.envelopes for select using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can insert own envelopes" on public.envelopes;
create policy "Users can insert own envelopes" on public.envelopes for insert with check (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can update own envelopes" on public.envelopes;
create policy "Users can update own envelopes" on public.envelopes for update using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can delete own envelopes" on public.envelopes;
create policy "Users can delete own envelopes" on public.envelopes for delete using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

-- Goals
drop policy if exists "Users can read own goals" on public.goals;
create policy "Users can read own goals" on public.goals for select using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can create own goals" on public.goals;
create policy "Users can create own goals" on public.goals for insert with check (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));
drop policy if exists "Users can update own goals" on public.goals;
create policy "Users can update own goals" on public.goals for update using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

-- Counterparties (Original is a FOR ALL policy)
drop policy if exists "Users can manage own counterparties" on public.counterparties;
create policy "Users can manage own counterparties" on public.counterparties for all 
using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
with check (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

-- Debts (Original is a FOR ALL policy)
drop policy if exists "Users can manage own debts" on public.debts;
create policy "Users can manage own debts" on public.debts for all 
using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
with check (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

-- Recurring Obligations (Original uses specific policies based on payment history)
drop policy if exists "Users can view own recurring obligations" on public.recurring_obligations;
create policy "Users can view own recurring obligations" on public.recurring_obligations for select 
using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

drop policy if exists "Users can update metadata of own recurring obligations" on public.recurring_obligations;
create policy "Users can update metadata of own recurring obligations" on public.recurring_obligations for update 
using (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()))
with check (user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()));

drop policy if exists "Users can delete own recurring obligations without payment history" on public.recurring_obligations;
create policy "Users can delete own recurring obligations without payment history" on public.recurring_obligations for delete 
using (
  user_id = auth.uid() and space_id in (select id from public.financial_spaces where owner_user_id = auth.uid()) and
  not exists (select 1 from public.recurring_payments where obligation_id = id)
);
