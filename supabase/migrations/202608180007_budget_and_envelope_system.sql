-- ============================================================
-- KASH BETA SPRINT 15: Budget & Envelope System Migration
-- Tables: public.budgets, public.budget_versions,
--         public.budget_envelope_categories, public.budget_notification_logs
-- Functions: Authoritative monthly progress, overview, 
--            overlap validation, future-dated versioning,
--            sequential positive rollover, and 80%/100% threshold notifications.
-- ============================================================

-- 1. Create Budgets Table (Planning Entity Identity & Scope)
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('category', 'envelope')),
  category_id uuid null references public.categories(id) on delete cascade,
  start_period date not null check (extract(day from start_period) = 1),
  end_period date null check (end_period is null or (extract(day from end_period) = 1 and end_period >= start_period)),
  repeat_monthly boolean not null default true,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_type_category_check check (
    (type = 'category' and category_id is not null) or
    (type = 'envelope' and category_id is null)
  )
);

-- 2. Create Budget Versions Table (Effective-Dated Financial & Policy Snapshots)
create table if not exists public.budget_versions (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  effective_from_period date not null check (extract(day from effective_from_period) = 1),
  amount numeric(18,2) not null check (amount > 0),
  rollover_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint unique_budget_version_period unique (budget_id, effective_from_period)
);

-- 3. Create Budget Envelope Categories Table (Effective-Dated Category Membership)
create table if not exists public.budget_envelope_categories (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.budgets(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  effective_from_period date not null check (extract(day from effective_from_period) = 1),
  effective_to_period date null check (effective_to_period is null or (extract(day from effective_to_period) = 1 and effective_to_period >= effective_from_period)),
  created_at timestamptz not null default now(),
  constraint unique_envelope_category_version unique (envelope_id, category_id, effective_from_period)
);

-- 4. Create Budget Notification Deduplication Table
create table if not exists public.budget_notification_logs (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null check (extract(day from period_start) = 1),
  threshold_percent integer not null check (threshold_percent in (80, 100)),
  created_at timestamptz not null default now(),
  constraint unique_budget_threshold_period unique (budget_id, period_start, threshold_percent)
);

-- 5. Indexes for High Performance
create index if not exists budgets_user_idx on public.budgets(user_id, start_period);
create index if not exists budgets_category_idx on public.budgets(category_id) where category_id is not null;
create index if not exists budget_versions_lookup_idx on public.budget_versions(budget_id, effective_from_period desc);
create index if not exists budget_envelope_categories_lookup_idx on public.budget_envelope_categories(envelope_id, effective_from_period);
create index if not exists budget_envelope_categories_cat_idx on public.budget_envelope_categories(category_id);
create index if not exists budget_notification_logs_lookup_idx on public.budget_notification_logs(budget_id, period_start, threshold_percent);

-- 6. Row Level Security (RLS)
alter table public.budgets enable row level security;
alter table public.budget_versions enable row level security;
alter table public.budget_envelope_categories enable row level security;
alter table public.budget_notification_logs enable row level security;

-- Policies for budgets
drop policy if exists "Users can view their own budgets" on public.budgets;
create policy "Users can view their own budgets"
on public.budgets for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own budgets" on public.budgets;
create policy "Users can insert their own budgets"
on public.budgets for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own budgets" on public.budgets;
create policy "Users can update their own budgets"
on public.budgets for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own budgets" on public.budgets;
create policy "Users can delete their own budgets"
on public.budgets for delete
using (auth.uid() = user_id);

-- Policies for budget_versions
drop policy if exists "Users can view their own budget versions" on public.budget_versions;
create policy "Users can view their own budget versions"
on public.budget_versions for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own budget versions" on public.budget_versions;
create policy "Users can insert their own budget versions"
on public.budget_versions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own budget versions" on public.budget_versions;
create policy "Users can update their own budget versions"
on public.budget_versions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own budget versions" on public.budget_versions;
create policy "Users can delete their own budget versions"
on public.budget_versions for delete
using (auth.uid() = user_id);

-- Policies for budget_envelope_categories
drop policy if exists "Users can view their envelope categories" on public.budget_envelope_categories;
create policy "Users can view their envelope categories"
on public.budget_envelope_categories for select
using (
  exists (
    select 1 from public.budgets b
    where b.id = envelope_id and b.user_id = auth.uid()
  )
);

drop policy if exists "Users can manage their envelope categories" on public.budget_envelope_categories;
create policy "Users can manage their envelope categories"
on public.budget_envelope_categories for all
using (
  exists (
    select 1 from public.budgets b
    where b.id = envelope_id and b.user_id = auth.uid()
  )
);

-- Policies for budget_notification_logs
drop policy if exists "Users can view their notification logs" on public.budget_notification_logs;
create policy "Users can view their notification logs"
on public.budget_notification_logs for select
using (auth.uid() = user_id);

-- 7. Range Overlap Validation Function (Strict Category Allocation Rule)
create or replace function public.validate_budget_category_assignment(
  p_user_id uuid,
  p_budget_id uuid,
  p_category_id uuid,
  p_start_date date,
  p_end_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_end date := coalesce(p_end_date, '9999-12-01'::date);
  v_conflict_count integer := 0;
  v_conflict_name text;
begin
  -- 1. Check against other active Category Budgets
  select b.name into v_conflict_name
  from public.budgets b
  where b.user_id = p_user_id
    and b.id != p_budget_id
    and b.type = 'category'
    and b.category_id = p_category_id
    and greatest(p_start_date, b.start_period) <= least(v_effective_end, case when b.repeat_monthly then coalesce(b.end_period, '9999-12-01'::date) else b.start_period end)
  limit 1;

  if v_conflict_name is not null then
    raise exception 'Kategori ini sudah terdaftar pada Budget Kategori "%" pada periode yang bertabrakan.', v_conflict_name;
  end if;

  -- 2. Check against other active Envelopes
  select b.name into v_conflict_name
  from public.budget_envelope_categories bec
  join public.budgets b on b.id = bec.envelope_id
  where b.user_id = p_user_id
    and b.id != p_budget_id
    and bec.category_id = p_category_id
    and greatest(p_start_date, greatest(b.start_period, bec.effective_from_period)) <= least(
      v_effective_end,
      least(
        case when b.repeat_monthly then coalesce(b.end_period, '9999-12-01'::date) else b.start_period end,
        coalesce(bec.effective_to_period, '9999-12-01'::date)
      )
    )
  limit 1;

  if v_conflict_name is not null then
    raise exception 'Kategori ini sudah terdaftar pada Amplop "%" pada periode yang bertabrakan.', v_conflict_name;
  end if;

  return true;
end;
$$;

-- 8. Authoritative Monthly Budget Progress RPC
create or replace function public.get_monthly_budget_progress(
  p_period_start date default null
)
returns table (
  budget_id uuid,
  name text,
  type text,
  category_id uuid,
  category_name text,
  category_icon text,
  category_color text,
  note text,
  repeat_monthly boolean,
  start_period date,
  end_period date,
  base_amount numeric,
  rollover_enabled boolean,
  rollover_amount numeric,
  effective_budget numeric,
  spent numeric,
  remaining numeric,
  usage_percentage numeric,
  status text,
  included_category_ids uuid[],
  included_category_names text[]
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_period date;
  v_prev_period date;
  v_user_tz text;
  v_target_start_timestamptz timestamptz;
  v_target_end_timestamptz timestamptz;
  v_prev_start_timestamptz timestamptz;
  v_prev_end_timestamptz timestamptz;
begin
  if v_user_id is null then
    raise exception 'User must be authenticated.';
  end if;

  -- Normalize target period to 1st of month
  if p_period_start is null then
    v_target_period := date_trunc('month', current_date)::date;
  else
    v_target_period := date_trunc('month', p_period_start)::date;
  end if;

  v_prev_period := (v_target_period - interval '1 month')::date;

  -- User Timezone
  select coalesce(timezone, 'Asia/Jakarta') into v_user_tz
  from public.profiles where id = v_user_id;

  -- Compute timezone-correct boundaries
  v_target_start_timestamptz := (v_target_period::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_target_end_timestamptz := ((v_target_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone v_user_tz;

  v_prev_start_timestamptz := (v_prev_period::text || ' 00:00:00')::timestamp at time zone v_user_tz;
  v_prev_end_timestamptz := ((v_prev_period + interval '1 month')::date::text || ' 00:00:00')::timestamp at time zone v_user_tz;

  return query
  with applicable_budgets as (
    select
      b.id as b_id,
      b.name as b_name,
      b.type as b_type,
      b.category_id as b_category_id,
      b.note as b_note,
      b.repeat_monthly as b_repeat_monthly,
      b.start_period as b_start_period,
      b.end_period as b_end_period
    from public.budgets b
    where b.user_id = v_user_id
      and b.start_period <= v_target_period
      and (
        (b.repeat_monthly = false and b.start_period = v_target_period) or
        (b.repeat_monthly = true and (b.end_period is null or b.end_period >= v_target_period))
      )
  ),
  resolved_versions as (
    select
      ab.b_id,
      bv.amount as ver_amount,
      bv.rollover_enabled as ver_rollover_enabled
    from applicable_budgets ab
    cross join lateral (
      select v.amount, v.rollover_enabled
      from public.budget_versions v
      where v.budget_id = ab.b_id
        and v.effective_from_period <= v_target_period
      order by v.effective_from_period desc
      limit 1
    ) bv
  ),
  resolved_categories as (
    select
      ab.b_id,
      case
        when ab.b_type = 'category' then array[ab.b_category_id]::uuid[]
        else coalesce(
          (
            select array_agg(bec.category_id)
            from public.budget_envelope_categories bec
            where bec.envelope_id = ab.b_id
              and bec.effective_from_period <= v_target_period
              and (bec.effective_to_period is null or bec.effective_to_period >= v_target_period)
          ),
          '{}'::uuid[]
        )
      end as cat_ids
    from applicable_budgets ab
  ),
  target_spending as (
    select
      ab.b_id,
      coalesce(
        (
          select sum(t.amount)
          from public.transactions t
          where t.user_id = v_user_id
            and t.type = 'expense'
            and t.status = 'completed'
            and t.category_id = any(rc.cat_ids)
            and t.transaction_date >= v_target_start_timestamptz
            and t.transaction_date < v_target_end_timestamptz
        ),
        0
      ) as target_spent
    from applicable_budgets ab
    join resolved_categories rc on rc.b_id = ab.b_id
  ),
  prev_month_evaluation as (
    select
      ab.b_id,
      case
        when rv.ver_rollover_enabled and (
          (ab.b_repeat_monthly and ab.b_start_period <= v_prev_period and (ab.b_end_period is null or ab.b_end_period >= v_prev_period)) or
          (not ab.b_repeat_monthly and ab.b_start_period = v_prev_period)
        ) then
          greatest(
            coalesce(
              (
                select pv.amount
                from public.budget_versions pv
                where pv.budget_id = ab.b_id
                  and pv.effective_from_period <= v_prev_period
                order by pv.effective_from_period desc
                limit 1
              ),
              0
            ) - coalesce(
              (
                select sum(t.amount)
                from public.transactions t
                where t.user_id = v_user_id
                  and t.type = 'expense'
                  and t.status = 'completed'
                  and t.transaction_date >= v_prev_start_timestamptz
                  and t.transaction_date < v_prev_end_timestamptz
                  and t.category_id = any(
                    case
                      when ab.b_type = 'category' then array[ab.b_category_id]::uuid[]
                      else coalesce(
                        (
                          select array_agg(pbec.category_id)
                          from public.budget_envelope_categories pbec
                          where pbec.envelope_id = ab.b_id
                            and pbec.effective_from_period <= v_prev_period
                            and (pbec.effective_to_period is null or pbec.effective_to_period >= v_prev_period)
                        ),
                        '{}'::uuid[]
                      )
                    end
                  )
              ),
              0
            ),
            0
          )
        else 0
      end as calculated_rollover
    from applicable_budgets ab
    join resolved_versions rv on rv.b_id = ab.b_id
  )
  select
    ab.b_id as budget_id,
    ab.b_name as name,
    ab.b_type as type,
    ab.b_category_id as category_id,
    c.name as category_name,
    c.icon as category_icon,
    c.color as category_color,
    ab.b_note as note,
    ab.b_repeat_monthly as repeat_monthly,
    ab.b_start_period as start_period,
    ab.b_end_period as end_period,
    rv.ver_amount as base_amount,
    rv.ver_rollover_enabled as rollover_enabled,
    pme.calculated_rollover as rollover_amount,
    (rv.ver_amount + pme.calculated_rollover) as effective_budget,
    ts.target_spent as spent,
    ((rv.ver_amount + pme.calculated_rollover) - ts.target_spent) as remaining,
    case
      when (rv.ver_amount + pme.calculated_rollover) > 0 then
        round((ts.target_spent / (rv.ver_amount + pme.calculated_rollover)) * 100, 2)
      else 0
    end as usage_percentage,
    case
      when ts.target_spent >= (rv.ver_amount + pme.calculated_rollover) and (rv.ver_amount + pme.calculated_rollover) > 0 then 'over_budget'
      when (rv.ver_amount + pme.calculated_rollover) > 0 and (ts.target_spent / (rv.ver_amount + pme.calculated_rollover)) >= 0.8 then 'near_limit'
      else 'healthy'
    end as status,
    rc.cat_ids as included_category_ids,
    (
      select array_agg(cats.name)
      from public.categories cats
      where cats.id = any(rc.cat_ids)
    ) as included_category_names
  from applicable_budgets ab
  join resolved_versions rv on rv.b_id = ab.b_id
  join resolved_categories rc on rc.b_id = ab.b_id
  join target_spending ts on ts.b_id = ab.b_id
  join prev_month_evaluation pme on pme.b_id = ab.b_id
  left join public.categories c on c.id = ab.b_category_id
  order by ab.b_type asc, ab.b_name asc;
end;
$$;

-- 9. Authoritative Monthly Budget Overview RPC
create or replace function public.get_monthly_budget_overview(
  p_period_start date default null
)
returns table (
  period_start date,
  total_budget numeric,
  total_spent numeric,
  total_remaining numeric,
  overall_usage_percentage numeric,
  total_budgets_count integer,
  healthy_count integer,
  near_limit_count integer,
  over_budget_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target_period date;
begin
  if p_period_start is null then
    v_target_period := date_trunc('month', current_date)::date;
  else
    v_target_period := date_trunc('month', p_period_start)::date;
  end if;

  return query
  with progress_rows as (
    select * from public.get_monthly_budget_progress(v_target_period)
  )
  select
    v_target_period as period_start,
    coalesce(sum(pr.effective_budget), 0) as total_budget,
    coalesce(sum(pr.spent), 0) as total_spent,
    coalesce(sum(pr.remaining), 0) as total_remaining,
    case
      when coalesce(sum(pr.effective_budget), 0) > 0 then
        round((coalesce(sum(pr.spent), 0) / coalesce(sum(pr.effective_budget), 0)) * 100, 2)
      else 0
    end as overall_usage_percentage,
    count(*)::integer as total_budgets_count,
    count(*) filter (where pr.status = 'healthy')::integer as healthy_count,
    count(*) filter (where pr.status = 'near_limit')::integer as near_limit_count,
    count(*) filter (where pr.status = 'over_budget')::integer as over_budget_count
  from progress_rows pr;
end;
$$;

-- 10. Creation RPCs
create or replace function public.create_category_budget(
  p_name text,
  p_category_id uuid,
  p_amount numeric,
  p_start_period date,
  p_repeat_monthly boolean default true,
  p_rollover_enabled boolean default false,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_budget_id uuid;
  v_norm_period date := date_trunc('month', p_start_period)::date;
begin
  if v_user_id is null then
    raise exception 'User must be authenticated.';
  end if;
  if p_amount <= 0 then
    raise exception 'Budget amount must be positive.';
  end if;
  if p_category_id is null then
    raise exception 'Category is required for Category Budget.';
  end if;

  -- Validate Category Type is Expense
  if not exists (
    select 1 from public.categories
    where id = p_category_id and category_type = 'expense'
  ) then
    raise exception 'Hanya kategori pengeluaran (expense) yang dapat dialokasikan ke budget.';
  end if;

  -- Validate no overlap
  perform public.validate_budget_category_assignment(
    v_user_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_category_id,
    v_norm_period,
    case when p_repeat_monthly then null else v_norm_period end
  );

  -- Create budget master
  insert into public.budgets (
    user_id,
    name,
    type,
    category_id,
    start_period,
    repeat_monthly,
    note
  ) values (
    v_user_id,
    trim(p_name),
    'category',
    p_category_id,
    v_norm_period,
    p_repeat_monthly,
    p_note
  ) returning id into v_budget_id;

  -- Create initial budget version
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
    p_rollover_enabled
  );

  return v_budget_id;
end;
$$;

create or replace function public.create_envelope_budget(
  p_name text,
  p_category_ids uuid[],
  p_amount numeric,
  p_start_period date,
  p_repeat_monthly boolean default true,
  p_rollover_enabled boolean default false,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_budget_id uuid;
  v_cat_id uuid;
  v_norm_period date := date_trunc('month', p_start_period)::date;
begin
  if v_user_id is null then
    raise exception 'User must be authenticated.';
  end if;
  if p_amount <= 0 then
    raise exception 'Budget amount must be positive.';
  end if;
  if p_category_ids is null or array_length(p_category_ids, 1) = 0 then
    raise exception 'At least one category is required for an Envelope.';
  end if;

  -- Validate all categories are expense
  if exists (
    select 1 from public.categories
    where id = any(p_category_ids) and category_type != 'expense'
  ) then
    raise exception 'Hanya kategori pengeluaran (expense) yang dapat dialokasikan ke amplop.';
  end if;

  -- Validate no overlap for every category
  foreach v_cat_id in array p_category_ids loop
    perform public.validate_budget_category_assignment(
      v_user_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      v_cat_id,
      v_norm_period,
      case when p_repeat_monthly then null else v_norm_period end
    );
  end loop;

  -- Create envelope master
  insert into public.budgets (
    user_id,
    name,
    type,
    category_id,
    start_period,
    repeat_monthly,
    note
  ) values (
    v_user_id,
    trim(p_name),
    'envelope',
    null,
    v_norm_period,
    p_repeat_monthly,
    p_note
  ) returning id into v_budget_id;

  -- Create initial budget version
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
    p_rollover_enabled
  );

  -- Insert category memberships
  foreach v_cat_id in array p_category_ids loop
    insert into public.budget_envelope_categories (
      envelope_id,
      category_id,
      effective_from_period,
      effective_to_period
    ) values (
      v_budget_id,
      v_cat_id,
      v_norm_period,
      null
    );
  end loop;

  return v_budget_id;
end;
$$;

-- 11. Update Budget RPC (Future-Dated Versioning & Membership Semantics)
create or replace function public.update_budget(
  p_budget_id uuid,
  p_name text,
  p_note text,
  p_effective_period date,
  p_amount numeric default null,
  p_rollover_enabled boolean default null,
  p_category_ids uuid[] default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_budget record;
  v_norm_period date := date_trunc('month', p_effective_period)::date;
  v_cat_id uuid;
  v_prev_month date := (v_norm_period - interval '1 month')::date;
begin
  if v_user_id is null then
    raise exception 'User must be authenticated.';
  end if;

  select * into v_budget
  from public.budgets
  where id = p_budget_id and user_id = v_user_id;

  if v_budget is null then
    raise exception 'Budget not found.';
  end if;

  -- 1. Update master metadata
  update public.budgets
  set name = trim(p_name),
      note = p_note,
      updated_at = now()
  where id = p_budget_id;

  -- 2. Update financial version if amount or rollover provided
  if p_amount is not null and p_amount > 0 then
    insert into public.budget_versions (
      budget_id,
      user_id,
      effective_from_period,
      amount,
      rollover_enabled
    ) values (
      p_budget_id,
      v_user_id,
      v_norm_period,
      p_amount,
      coalesce(p_rollover_enabled, false)
    )
    on conflict (budget_id, effective_from_period)
    do update set
      amount = excluded.amount,
      rollover_enabled = excluded.rollover_enabled;
  end if;

  -- 3. Update envelope categories if envelope type
  if v_budget.type = 'envelope' and p_category_ids is not null then
    -- Validate no overlap for newly assigned categories
    foreach v_cat_id in array p_category_ids loop
      perform public.validate_budget_category_assignment(
        v_user_id,
        p_budget_id,
        v_cat_id,
        v_norm_period,
        case when v_budget.repeat_monthly then v_budget.end_period else v_norm_period end
      );
    end loop;

    -- Close removed categories effective previous month
    update public.budget_envelope_categories
    set effective_to_period = v_prev_month
    where envelope_id = p_budget_id
      and not (category_id = any(p_category_ids))
      and (effective_to_period is null or effective_to_period >= v_norm_period)
      and effective_from_period < v_norm_period;

    -- Delete memberships that started at v_norm_period but are no longer present
    delete from public.budget_envelope_categories
    where envelope_id = p_budget_id
      and not (category_id = any(p_category_ids))
      and effective_from_period = v_norm_period;

    -- Add new categories effective v_norm_period
    foreach v_cat_id in array p_category_ids loop
      if not exists (
        select 1 from public.budget_envelope_categories
        where envelope_id = p_budget_id
          and category_id = v_cat_id
          and effective_from_period <= v_norm_period
          and (effective_to_period is null or effective_to_period >= v_norm_period)
      ) then
        insert into public.budget_envelope_categories (
          envelope_id,
          category_id,
          effective_from_period,
          effective_to_period
        ) values (
          p_budget_id,
          v_cat_id,
          v_norm_period,
          null
        )
        on conflict (envelope_id, category_id, effective_from_period)
        do update set effective_to_period = null;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

-- 12. Archive / End Period RPC
create or replace function public.archive_budget(
  p_budget_id uuid,
  p_end_period date
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_norm_period date := date_trunc('month', p_end_period)::date;
begin
  if v_user_id is null then
    raise exception 'User must be authenticated.';
  end if;

  update public.budgets
  set end_period = v_norm_period,
      updated_at = now()
  where id = p_budget_id and user_id = v_user_id;

  return true;
end;
$$;

-- 13. Delete Budget RPC (Safe cleanup if no historical transactions / or explicit deletion)
create or replace function public.delete_budget(
  p_budget_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'User must be authenticated.';
  end if;

  delete from public.budgets
  where id = p_budget_id and user_id = v_user_id;

  return true;
end;
$$;

-- 14. Threshold Notification Trigger Function on Transactions
create or replace function public.evaluate_budget_threshold_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tx_date timestamptz;
  v_category_id uuid;
  v_user_tz text;
  v_local_month date;
  v_rec record;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_tx_date := old.transaction_date;
    v_category_id := old.category_id;
  else
    v_user_id := new.user_id;
    v_tx_date := new.transaction_date;
    v_category_id := new.category_id;
  end if;

  if v_category_id is null or v_user_id is null then
    return coalesce(new, old);
  end if;

  select coalesce(timezone, 'Asia/Jakarta') into v_user_tz
  from public.profiles where id = v_user_id;

  -- Determine local month of the transaction
  v_local_month := date_trunc('month', (v_tx_date at time zone v_user_tz))::date;

  -- Evaluate all active budgets/envelopes containing this category in this local month
  for v_rec in (
    select
      b.id as budget_id,
      b.name as budget_name,
      pr.usage_percentage,
      pr.spent,
      pr.effective_budget
    from public.budgets b
    cross join lateral (
      select usage_percentage, spent, effective_budget
      from public.get_monthly_budget_progress(v_local_month) prog
      where prog.budget_id = b.id
    ) pr
    where b.user_id = v_user_id
      and (
        (b.type = 'category' and b.category_id = v_category_id) or
        (b.type = 'envelope' and exists (
          select 1 from public.budget_envelope_categories bec
          where bec.envelope_id = b.id
            and bec.category_id = v_category_id
            and bec.effective_from_period <= v_local_month
            and (bec.effective_to_period is null or bec.effective_to_period >= v_local_month)
        ))
      )
  ) loop
    -- 100% threshold crossed
    if v_rec.usage_percentage >= 100.0 then
      if not exists (
        select 1 from public.budget_notification_logs
        where budget_id = v_rec.budget_id
          and period_start = v_local_month
          and threshold_percent = 100
      ) then
        insert into public.budget_notification_logs (budget_id, user_id, period_start, threshold_percent)
        values (v_rec.budget_id, v_user_id, v_local_month, 100)
        on conflict do nothing;

        perform public.create_notification(
          v_user_id,
          'budget_exceeded',
          'Anggaran Terlampaui: ' || v_rec.budget_name,
          'Pengeluaran Anda telah melebihi batas anggaran untuk bulan ini.',
          'budget',
          v_rec.budget_id,
          jsonb_build_object(
            'period_start', v_local_month,
            'usage_percentage', v_rec.usage_percentage,
            'target_path', '/budgets/' || v_rec.budget_id::text
          )
        );
      end if;

    -- 80% threshold crossed
    elsif v_rec.usage_percentage >= 80.0 then
      if not exists (
        select 1 from public.budget_notification_logs
        where budget_id = v_rec.budget_id
          and period_start = v_local_month
          and threshold_percent = 80
      ) then
        insert into public.budget_notification_logs (budget_id, user_id, period_start, threshold_percent)
        values (v_rec.budget_id, v_user_id, v_local_month, 80)
        on conflict do nothing;

        perform public.create_notification(
          v_user_id,
          'budget_near_limit',
          'Mendekati Batas: ' || v_rec.budget_name,
          'Pengeluaran Anda telah mencapai ' || round(v_rec.usage_percentage)::text || '% dari batas anggaran.',
          'budget',
          v_rec.budget_id,
          jsonb_build_object(
            'period_start', v_local_month,
            'usage_percentage', v_rec.usage_percentage,
            'target_path', '/budgets/' || v_rec.budget_id::text
          )
        );
      end if;
    end if;
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_transactions_budget_threshold on public.transactions;
create trigger trg_transactions_budget_threshold
after insert or update or delete on public.transactions
for each row
execute function public.evaluate_budget_threshold_notifications();
