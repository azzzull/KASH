create extension if not exists pgcrypto;

create type public.wallet_type as enum (
  'bank',
  'digital_bank',
  'ewallet',
  'cash',
  'investment',
  'savings',
  'custom'
);

create type public.transaction_type as enum (
  'income',
  'expense',
  'transfer',
  'adjustment'
);

create type public.transaction_status as enum (
  'completed',
  'void'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  default_currency char(3) not null default 'IDR',
  timezone text not null default 'Asia/Jakarta',
  locale text not null default 'id-ID',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_default_currency_format check (default_currency = upper(default_currency))
);

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  wallet_type public.wallet_type not null,
  institution_name text,
  account_reference text,
  initial_balance numeric(18,2) not null default 0,
  currency char(3) not null default 'IDR',
  icon text,
  color text,
  include_in_net_worth boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_name_not_blank check (length(trim(name)) > 0),
  constraint wallets_currency_format check (currency = upper(currency))
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  category_type text not null,
  icon text,
  color text,
  is_system boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_type_valid check (category_type in ('income', 'expense')),
  constraint categories_system_owner_valid check (
    (is_system = true and user_id is null)
    or
    (is_system = false and user_id is not null)
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.transaction_type not null,
  amount numeric(18,2) not null,
  wallet_id uuid not null references public.wallets(id),
  category_id uuid references public.categories(id),
  destination_wallet_id uuid references public.wallets(id),
  transfer_fee numeric(18,2) not null default 0,
  transaction_date timestamptz not null default now(),
  title text,
  note text,
  attachment_url text,
  status public.transaction_status not null default 'completed',
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amount_valid check (
    (type in ('income', 'expense', 'transfer') and amount > 0)
    or
    (type = 'adjustment' and amount <> 0)
  ),
  constraint transactions_transfer_fee_valid check (transfer_fee >= 0),
  constraint transactions_transfer_wallets_valid check (
    (type = 'transfer' and destination_wallet_id is not null and wallet_id <> destination_wallet_id)
    or
    (type <> 'transfer' and destination_wallet_id is null)
  ),
  constraint transactions_transfer_fee_only_on_transfer check (
    (type = 'transfer')
    or
    (type <> 'transfer' and transfer_fee = 0)
  )
);

create index wallets_user_id_idx on public.wallets(user_id);
create index categories_user_id_idx on public.categories(user_id);
create index categories_system_type_idx on public.categories(is_system, category_type);
create index transactions_user_date_idx on public.transactions(user_id, transaction_date desc);
create index transactions_wallet_id_idx on public.transactions(wallet_id);
create index transactions_destination_wallet_id_idx on public.transactions(destination_wallet_id);
create index transactions_category_id_idx on public.transactions(category_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger wallets_set_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.validate_transaction_relationships()
returns trigger
language plpgsql
as $$
declare
  source_wallet_user_id uuid;
  destination_wallet_user_id uuid;
  category_owner_id uuid;
  category_is_system boolean;
  category_kind text;
begin
  select user_id into source_wallet_user_id
  from public.wallets
  where id = new.wallet_id;

  if source_wallet_user_id is null or source_wallet_user_id <> new.user_id then
    raise exception 'Transaction source wallet must belong to the transaction user.';
  end if;

  if new.destination_wallet_id is not null then
    select user_id into destination_wallet_user_id
    from public.wallets
    where id = new.destination_wallet_id;

    if destination_wallet_user_id is null or destination_wallet_user_id <> new.user_id then
      raise exception 'Transaction destination wallet must belong to the transaction user.';
    end if;
  end if;

  if new.category_id is not null then
    select user_id, is_system, category_type
    into category_owner_id, category_is_system, category_kind
    from public.categories
    where id = new.category_id;

    if category_kind is null then
      raise exception 'Transaction category does not exist.';
    end if;

    if category_is_system = false and category_owner_id <> new.user_id then
      raise exception 'Transaction category must belong to the transaction user.';
    end if;

    if new.type in ('income', 'expense') and category_kind <> new.type::text then
      raise exception 'Transaction category type must match income or expense transaction type.';
    end if;

    if new.type in ('transfer', 'adjustment') then
      raise exception 'Transfer and adjustment transactions must not use income or expense categories.';
    end if;
  end if;

  return new;
end;
$$;

create trigger transactions_validate_relationships
before insert or update on public.transactions
for each row execute function public.validate_transaction_relationships();

insert into public.categories (name, category_type, icon, color, is_system)
values
  ('Salary', 'income', 'briefcase', '#10B981', true),
  ('Freelance', 'income', 'laptop', '#10B981', true),
  ('Business', 'income', 'store', '#10B981', true),
  ('Bonus', 'income', 'gift', '#10B981', true),
  ('Investment', 'income', 'trending-up', '#8B5CF6', true),
  ('Gift', 'income', 'gift', '#10B981', true),
  ('Refund', 'income', 'rotate-ccw', '#10B981', true),
  ('Other', 'income', 'circle', '#91A3BB', true),
  ('Food & Drink', 'expense', 'utensils', '#E50914', true),
  ('Transportation', 'expense', 'bus', '#E50914', true),
  ('Shopping', 'expense', 'shopping-bag', '#E50914', true),
  ('Bills', 'expense', 'receipt', '#E50914', true),
  ('Entertainment', 'expense', 'ticket', '#E50914', true),
  ('Health', 'expense', 'heart-pulse', '#E50914', true),
  ('Education', 'expense', 'graduation-cap', '#E50914', true),
  ('Lifestyle', 'expense', 'sparkles', '#E50914', true),
  ('Travel', 'expense', 'plane', '#E50914', true),
  ('Family', 'expense', 'users', '#E50914', true),
  ('Donation', 'expense', 'hand-heart', '#E50914', true),
  ('Other', 'expense', 'circle', '#91A3BB', true);

create or replace view public.wallet_balance_view
with (security_invoker = true) as
select
  w.id as wallet_id,
  w.user_id,
  w.initial_balance,
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
  ), 0)::numeric(18,2) as transaction_total,
  (
    w.initial_balance
    + coalesce(sum(
      case
        when t.status <> 'completed' then 0
        when t.type = 'income' and t.wallet_id = w.id then t.amount
        when t.type = 'expense' and t.wallet_id = w.id then -t.amount
        when t.type = 'adjustment' and t.wallet_id = w.id then t.amount
        when t.type = 'transfer' and t.wallet_id = w.id then -(t.amount + t.transfer_fee)
        when t.type = 'transfer' and t.destination_wallet_id = w.id then t.amount
        else 0
      end
    ), 0)
  )::numeric(18,2) as current_balance
from public.wallets w
left join public.transactions t
  on t.wallet_id = w.id
  or t.destination_wallet_id = w.id
group by w.id, w.user_id, w.initial_balance;

grant select on public.wallet_balance_view to authenticated;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read own wallets"
on public.wallets for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own wallets"
on public.wallets for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own wallets"
on public.wallets for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read system and own categories"
on public.categories for select
to authenticated
using (is_system = true or auth.uid() = user_id);

create policy "Users can create own custom categories"
on public.categories for insert
to authenticated
with check (auth.uid() = user_id and is_system = false);

create policy "Users can update own custom categories"
on public.categories for update
to authenticated
using (auth.uid() = user_id and is_system = false)
with check (auth.uid() = user_id and is_system = false);

create policy "Users can read own transactions"
on public.transactions for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own transactions"
on public.transactions for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own transactions"
on public.transactions for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
