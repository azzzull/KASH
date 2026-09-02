-- KASH: allow Personal -> Managed wallet move when cross-wallet transfers are
-- fully voided and can be deleted with zero balance effect.

create or replace function public.analyze_wallet_move_to_managed(
  p_wallet_id uuid,
  p_target_space_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_personal_space public.financial_spaces%rowtype;
  v_target_space public.financial_spaces%rowtype;
  v_balance numeric(18,2) := 0;
  v_total_transactions integer := 0;
  v_migratable_transactions integer := 0;
  v_custom_categories integer := 0;
  v_categories_to_create integer := 0;
  v_safe_voided_transfer_cleanups integer := 0;
  v_safe_dependencies integer := 0;
  v_blocking_issues jsonb := '[]'::jsonb;
  v_active_review_transfers jsonb := '[]'::jsonb;
  v_voided_cleanup_items jsonb := '[]'::jsonb;
  v_blocking_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_wallet
  from public.wallets
  where id = p_wallet_id;

  if not found then
    raise exception 'Wallet not found.';
  end if;

  if v_wallet.user_id <> v_user_id then
    raise exception 'Only the wallet owner can move this wallet.';
  end if;

  select * into v_personal_space
  from public.financial_spaces
  where id = v_wallet.space_id
    and owner_user_id = v_user_id
    and space_type = 'personal';

  if not found then
    raise exception 'Only Personal wallets can be moved to a Managed Space.';
  end if;

  select * into v_target_space
  from public.financial_spaces
  where id = p_target_space_id
    and space_type = 'managed'
    and is_archived = false;

  if not found then
    raise exception 'Target Managed Space not found.';
  end if;

  if not public.user_has_managed_space_role(
    p_target_space_id,
    array['owner', 'admin']::public.managed_space_role[]
  ) then
    raise exception 'Only a Managed Space owner or admin can receive a moved wallet.';
  end if;

  select coalesce(current_balance, 0)::numeric(18,2)
  into v_balance
  from public.wallet_balance_view
  where wallet_id = p_wallet_id;

  select count(*)::integer
  into v_total_transactions
  from public.transactions t
  where t.wallet_id = p_wallet_id
     or t.destination_wallet_id = p_wallet_id;

  select count(*)::integer
  into v_migratable_transactions
  from public.transactions t
  where t.wallet_id = p_wallet_id
    and t.destination_wallet_id is null
    and t.space_id = v_personal_space.id
    and t.type in ('income', 'expense', 'adjustment')
    and t.envelope_id is null
    and t.related_entity_type is null
    and t.related_entity_id is null
    and t.cross_space_event_id is null
    and t.cross_space_role is null
    and (
      t.category_id is null
      or exists (
        select 1
        from public.categories c
        where c.id = t.category_id
          and (
            c.is_system = true
            or (c.is_system = false and c.space_id = v_personal_space.id and c.user_id = v_user_id)
          )
      )
    );

  with needed_categories as (
    select distinct c.id, c.name, c.category_type, c.icon, c.color
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.wallet_id = p_wallet_id
      and t.destination_wallet_id is null
      and t.space_id = v_personal_space.id
      and t.type in ('income', 'expense')
      and t.envelope_id is null
      and t.related_entity_type is null
      and t.related_entity_id is null
      and t.cross_space_event_id is null
      and t.cross_space_role is null
      and c.is_system = false
      and c.space_id = v_personal_space.id
      and c.user_id = v_user_id
  )
  select
    count(*)::integer,
    count(*) filter (
      where not exists (
        select 1
        from public.categories target
        where target.is_system = false
          and target.space_id = p_target_space_id
          and lower(trim(target.name)) = lower(trim(needed_categories.name))
          and target.category_type = needed_categories.category_type
      )
    )::integer
  into v_custom_categories, v_categories_to_create
  from needed_categories;

  with candidate_voided_transfers as (
    select t.*
    from public.transactions t
    join public.wallets other_wallet
      on other_wallet.id = case
        when t.wallet_id = p_wallet_id then t.destination_wallet_id
        else t.wallet_id
      end
    where t.type = 'transfer'
      and t.status = 'void'
      and (t.wallet_id = p_wallet_id or t.destination_wallet_id = p_wallet_id)
      and t.space_id = v_personal_space.id
      and other_wallet.space_id = v_personal_space.id
      and other_wallet.id <> p_wallet_id
      and t.related_entity_type is null
      and t.related_entity_id is null
      and t.cross_space_event_id is null
      and t.cross_space_role is null
      and not exists (select 1 from public.debt_payments dp where dp.transaction_id = t.id)
      and not exists (select 1 from public.goal_contributions gc where gc.transaction_id = t.id)
      and not exists (select 1 from public.recurring_payments rp where rp.transaction_id = t.id)
      and not exists (select 1 from public.shared_savings_requests ssr where ssr.transaction_id = t.id)
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'date', t.transaction_date,
      'type', t.type,
      'amount', t.amount,
      'title', t.title,
      'note', t.note,
      'other_wallet_id', other_wallet.id,
      'other_wallet_name', other_wallet.name
    ) order by t.transaction_date desc), '[]'::jsonb)
  into v_safe_voided_transfer_cleanups, v_voided_cleanup_items
  from candidate_voided_transfers t
  join public.wallets other_wallet
    on other_wallet.id = case
      when t.wallet_id = p_wallet_id then t.destination_wallet_id
      else t.wallet_id
    end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'date', t.transaction_date,
    'type', t.type,
    'amount', t.amount,
    'title', t.title,
    'note', t.note,
    'other_wallet_id', other_wallet.id,
    'other_wallet_name', other_wallet.name
  ) order by t.transaction_date desc), '[]'::jsonb)
  into v_active_review_transfers
  from public.transactions t
  join public.wallets other_wallet
    on other_wallet.id = case
      when t.wallet_id = p_wallet_id then t.destination_wallet_id
      else t.wallet_id
    end
  where t.type = 'transfer'
    and (t.wallet_id = p_wallet_id or t.destination_wallet_id = p_wallet_id)
    and t.space_id = v_personal_space.id
    and other_wallet.space_id = v_personal_space.id
    and other_wallet.id <> p_wallet_id
    and not (
      t.status = 'void'
      and t.related_entity_type is null
      and t.related_entity_id is null
      and t.cross_space_event_id is null
      and t.cross_space_role is null
      and not exists (select 1 from public.debt_payments dp where dp.transaction_id = t.id)
      and not exists (select 1 from public.goal_contributions gc where gc.transaction_id = t.id)
      and not exists (select 1 from public.recurring_payments rp where rp.transaction_id = t.id)
      and not exists (select 1 from public.shared_savings_requests ssr where ssr.transaction_id = t.id)
    );

  with blocking as (
    select 'transfers' as code, 'Active or inconsistent cross-wallet transfers require review.' as title, jsonb_array_length(v_active_review_transfers)::integer as count
    union all
    select 'other_transfers', 'Transfers outside safe voided cleanup cannot be re-scoped automatically.', count(*)::integer
    from public.transactions t
    where t.type = 'transfer'
      and (t.wallet_id = p_wallet_id or t.destination_wallet_id = p_wallet_id)
      and not exists (
        select 1
        from jsonb_array_elements(v_voided_cleanup_items) item
        where item->>'id' = t.id::text
      )
      and not exists (
        select 1
        from jsonb_array_elements(v_active_review_transfers) item
        where item->>'id' = t.id::text
      )
    union all
    select 'linked_transactions', 'Linked, generated, enveloped, or cross-space transactions require review.', count(*)::integer
    from public.transactions t
    where (t.wallet_id = p_wallet_id or t.destination_wallet_id = p_wallet_id)
      and t.type <> 'transfer'
      and not (
        t.wallet_id = p_wallet_id
        and t.destination_wallet_id is null
        and t.space_id = v_personal_space.id
        and t.type in ('income', 'expense', 'adjustment')
        and t.envelope_id is null
        and t.related_entity_type is null
        and t.related_entity_id is null
        and t.cross_space_event_id is null
        and t.cross_space_role is null
        and (
          t.category_id is null
          or exists (
            select 1
            from public.categories c
            where c.id = t.category_id
              and (
                c.is_system = true
                or (c.is_system = false and c.space_id = v_personal_space.id and c.user_id = v_user_id)
              )
          )
        )
      )
    union all
    select 'goals', 'Goal pockets or goal contributions are not moved automatically.', count(*)::integer
    from (
      select id from public.goals where wallet_id = p_wallet_id
      union all
      select id from public.goal_contributions where wallet_id = p_wallet_id
    ) s
    union all
    select 'debt_payments', 'Debt and receivable payments linked to this wallet require review.', count(*)::integer
    from public.debt_payments
    where wallet_id = p_wallet_id
    union all
    select 'recurring', 'Recurring obligations or paid occurrences linked to this wallet require review.', count(*)::integer
    from (
      select id from public.recurring_obligations where default_wallet_id = p_wallet_id
      union all
      select id from public.recurring_payments where wallet_id = p_wallet_id
    ) s
    union all
    select 'budgets', 'Budget targets linked directly to this wallet require review.', count(*)::integer
    from public.budgets
    where wallet_id = p_wallet_id
    union all
    select 'shared_savings', 'Shared Savings requests linked to this wallet require review.', count(*)::integer
    from public.shared_savings_requests
    where source_wallet_id = p_wallet_id
       or destination_wallet_id = p_wallet_id
    union all
    select 'cross_space_settlements', 'Cross-space settlements linked to this wallet require review.', count(*)::integer
    from public.cross_space_settlements
    where managed_wallet_id = p_wallet_id
       or personal_wallet_id = p_wallet_id
    union all
    select 'investment_history', 'Investment wallets/history need managed-space investment RLS before migration.', count(*)::integer
    from (
      select id from public.investment_valuations where wallet_id = p_wallet_id
      union all
      select id from public.investment_activities where wallet_id = p_wallet_id
      union all
      select v_wallet.id where v_wallet.wallet_type = 'investment'
    ) s
  )
  select
    coalesce(sum(count), 0)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'classification', 'BLOCK_AND_REVIEW',
      'code', code,
      'title', title,
      'count', count,
      'items', case when code = 'transfers' then v_active_review_transfers else '[]'::jsonb end
    )) filter (where count > 0), '[]'::jsonb)
  into v_blocking_count, v_blocking_issues
  from blocking;

  v_safe_dependencies := v_migratable_transactions + v_custom_categories + v_safe_voided_transfer_cleanups;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'id', v_wallet.id,
      'name', v_wallet.name,
      'currency', v_wallet.currency,
      'current_balance', v_balance
    ),
    'source_space_id', v_personal_space.id,
    'target_space_id', v_target_space.id,
    'target_space_name', v_target_space.name,
    'transactions_to_move', v_migratable_transactions,
    'total_wallet_transactions', v_total_transactions,
    'custom_categories_to_copy', v_categories_to_create,
    'custom_categories_to_reuse_or_copy', v_custom_categories,
    'safe_voided_transfer_cleanups', v_safe_voided_transfer_cleanups,
    'safe_dependencies', v_safe_dependencies,
    'needs_transformation', 0,
    'requires_review', v_blocking_count,
    'blocking_issues', v_blocking_issues,
    'safe_cleanup_issues', case
      when v_safe_voided_transfer_cleanups > 0 then jsonb_build_array(jsonb_build_object(
        'classification', 'SAFE_VOIDED_TRANSFER_CLEANUP',
        'code', 'voided_transfer_cleanup',
        'title', 'Voided cross-wallet transfers can be permanently deleted before migration.',
        'count', v_safe_voided_transfer_cleanups,
        'items', v_voided_cleanup_items
      ))
      else '[]'::jsonb
    end,
    'can_move', v_blocking_count = 0 and (v_migratable_transactions + v_safe_voided_transfer_cleanups) = v_total_transactions
  );
end;
$$;

create or replace function public.move_wallet_to_managed(
  p_wallet_id uuid,
  p_target_space_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.wallets%rowtype;
  v_personal_space_id uuid;
  v_before_balance numeric(18,2) := 0;
  v_after_cleanup_balance numeric(18,2) := 0;
  v_after_balance numeric(18,2) := 0;
  v_analysis jsonb;
  v_category record;
  v_target_category_id uuid;
  v_moved_transactions integer := 0;
  v_deleted_voided_transfers integer := 0;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_wallet
  from public.wallets
  where id = p_wallet_id
  for update;

  if not found then
    raise exception 'Wallet not found.';
  end if;

  v_personal_space_id := v_wallet.space_id;

  select coalesce(current_balance, 0)::numeric(18,2)
  into v_before_balance
  from public.wallet_balance_view
  where wallet_id = p_wallet_id;

  v_analysis := public.analyze_wallet_move_to_managed(p_wallet_id, p_target_space_id);

  if coalesce((v_analysis->>'can_move')::boolean, false) is not true then
    raise exception 'Wallet migration requires review before it can be moved.';
  end if;

  create temporary table wallet_move_voided_transfer_cleanup (
    transaction_id uuid primary key
  ) on commit drop;

  insert into wallet_move_voided_transfer_cleanup(transaction_id)
  select (item->>'id')::uuid
  from jsonb_array_elements(coalesce(v_analysis->'safe_cleanup_issues'->0->'items', '[]'::jsonb)) item;

  if exists (
    select 1
    from wallet_move_voided_transfer_cleanup cleanup
    join public.transactions t on t.id = cleanup.transaction_id
    where t.type <> 'transfer'
       or t.status <> 'void'
       or t.related_entity_type is not null
       or t.related_entity_id is not null
       or t.cross_space_event_id is not null
       or t.cross_space_role is not null
       or exists (select 1 from public.debt_payments dp where dp.transaction_id = t.id)
       or exists (select 1 from public.goal_contributions gc where gc.transaction_id = t.id)
       or exists (select 1 from public.recurring_payments rp where rp.transaction_id = t.id)
       or exists (select 1 from public.shared_savings_requests ssr where ssr.transaction_id = t.id)
  ) then
    raise exception 'Wallet migration validation failed: voided transfer cleanup is no longer safe.';
  end if;

  delete from public.transactions t
  using wallet_move_voided_transfer_cleanup cleanup
  where t.id = cleanup.transaction_id;

  get diagnostics v_deleted_voided_transfers = row_count;

  if v_deleted_voided_transfers <> coalesce((v_analysis->>'safe_voided_transfer_cleanups')::integer, 0) then
    raise exception 'Wallet migration validation failed: voided transfer cleanup count changed.';
  end if;

  select coalesce(current_balance, 0)::numeric(18,2)
  into v_after_cleanup_balance
  from public.wallet_balance_view
  where wallet_id = p_wallet_id;

  if v_before_balance <> v_after_cleanup_balance then
    raise exception 'Wallet migration validation failed: deleting voided transfers changed wallet balance from % to %.', v_before_balance, v_after_cleanup_balance;
  end if;

  create temporary table wallet_move_category_map (
    source_category_id uuid primary key,
    target_category_id uuid not null
  ) on commit drop;

  for v_category in
    select distinct c.*
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.wallet_id = p_wallet_id
      and t.destination_wallet_id is null
      and t.space_id = v_personal_space_id
      and t.type in ('income', 'expense')
      and t.envelope_id is null
      and t.related_entity_type is null
      and t.related_entity_id is null
      and t.cross_space_event_id is null
      and t.cross_space_role is null
      and c.is_system = false
      and c.space_id = v_personal_space_id
      and c.user_id = v_user_id
  loop
    select id into v_target_category_id
    from public.categories
    where is_system = false
      and space_id = p_target_space_id
      and lower(trim(name)) = lower(trim(v_category.name))
      and category_type = v_category.category_type
    order by is_archived asc, created_at asc
    limit 1;

    if v_target_category_id is null then
      insert into public.categories (
        user_id,
        space_id,
        name,
        category_type,
        icon,
        color,
        is_system,
        is_archived
      ) values (
        v_user_id,
        p_target_space_id,
        v_category.name,
        v_category.category_type,
        v_category.icon,
        v_category.color,
        false,
        false
      )
      returning id into v_target_category_id;
    end if;

    insert into wallet_move_category_map(source_category_id, target_category_id)
    values (v_category.id, v_target_category_id)
    on conflict (source_category_id) do update
    set target_category_id = excluded.target_category_id;
  end loop;

  update public.wallets
  set
    space_id = p_target_space_id,
    include_in_net_worth = true,
    updated_at = now()
  where id = p_wallet_id
    and user_id = v_user_id
    and space_id = v_personal_space_id;

  update public.transactions t
  set
    space_id = p_target_space_id,
    category_id = coalesce(m.target_category_id, t.category_id),
    updated_at = now()
  from (
    select t2.id, cm.target_category_id
    from public.transactions t2
    left join wallet_move_category_map cm on cm.source_category_id = t2.category_id
    where t2.wallet_id = p_wallet_id
      and t2.destination_wallet_id is null
      and t2.space_id = v_personal_space_id
      and t2.type in ('income', 'expense', 'adjustment')
      and t2.envelope_id is null
      and t2.related_entity_type is null
      and t2.related_entity_id is null
      and t2.cross_space_event_id is null
      and t2.cross_space_role is null
  ) m
  where t.id = m.id;

  get diagnostics v_moved_transactions = row_count;

  if exists (
    select 1
    from public.transactions t
    where (t.wallet_id = p_wallet_id or t.destination_wallet_id = p_wallet_id)
      and t.space_id <> p_target_space_id
  ) then
    raise exception 'Wallet migration validation failed: transaction history remains in the source space.';
  end if;

  if exists (
    select 1
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.wallet_id = p_wallet_id
      and t.space_id = p_target_space_id
      and c.is_system = false
      and c.space_id <> p_target_space_id
  ) then
    raise exception 'Wallet migration validation failed: a migrated transaction still references a source-space category.';
  end if;

  select coalesce(current_balance, 0)::numeric(18,2)
  into v_after_balance
  from public.wallet_balance_view
  where wallet_id = p_wallet_id;

  if v_before_balance <> v_after_balance then
    raise exception 'Wallet migration validation failed: wallet balance changed from % to %.', v_before_balance, v_after_balance;
  end if;

  return jsonb_build_object(
    'success', true,
    'wallet_id', p_wallet_id,
    'source_space_id', v_personal_space_id,
    'target_space_id', p_target_space_id,
    'moved_transactions', v_moved_transactions,
    'deleted_voided_transfers', v_deleted_voided_transfers,
    'balance_before', v_before_balance,
    'balance_after', v_after_balance,
    'analysis', v_analysis
  );
end;
$$;

revoke execute on function public.analyze_wallet_move_to_managed(uuid, uuid) from public;
revoke execute on function public.move_wallet_to_managed(uuid, uuid) from public;
grant execute on function public.analyze_wallet_move_to_managed(uuid, uuid) to authenticated;
grant execute on function public.move_wallet_to_managed(uuid, uuid) to authenticated;
