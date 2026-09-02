-- KASH: make wallet move RPC safe for repeated calls in one DB session by
-- removing session-local temp tables from the mutation path.

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

  if exists (
    with cleanup as (
      select (item->>'id')::uuid as transaction_id
      from jsonb_array_elements(coalesce(v_analysis->'safe_cleanup_issues'->0->'items', '[]'::jsonb)) item
    )
    select 1
    from cleanup
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

  with cleanup as (
    select (item->>'id')::uuid as transaction_id
    from jsonb_array_elements(coalesce(v_analysis->'safe_cleanup_issues'->0->'items', '[]'::jsonb)) item
  ),
  deleted as (
    delete from public.transactions t
    using cleanup
    where t.id = cleanup.transaction_id
    returning t.id
  )
  select count(*)::integer into v_deleted_voided_transfers
  from deleted;

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

  with needed_categories as (
    select distinct c.name, c.category_type, c.icon, c.color
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
  )
  insert into public.categories (
    user_id,
    space_id,
    name,
    category_type,
    icon,
    color,
    is_system,
    is_archived
  )
  select
    v_user_id,
    p_target_space_id,
    needed_categories.name,
    needed_categories.category_type,
    needed_categories.icon,
    needed_categories.color,
    false,
    false
  from needed_categories
  where not exists (
    select 1
    from public.categories target
    where target.is_system = false
      and target.space_id = p_target_space_id
      and lower(trim(target.name)) = lower(trim(needed_categories.name))
      and target.category_type = needed_categories.category_type
  );

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
    category_id = coalesce(target_category.id, t.category_id),
    updated_at = now()
  from (
    select
      t2.id as transaction_id,
      c.id as source_category_id,
      c.name,
      c.category_type
    from public.transactions t2
    left join public.categories c on c.id = t2.category_id
    where t2.wallet_id = p_wallet_id
      and t2.destination_wallet_id is null
      and t2.space_id = v_personal_space_id
      and t2.type in ('income', 'expense', 'adjustment')
      and t2.envelope_id is null
      and t2.related_entity_type is null
      and t2.related_entity_id is null
      and t2.cross_space_event_id is null
      and t2.cross_space_role is null
  ) source_tx
  left join public.categories target_category
    on source_tx.source_category_id is not null
   and target_category.is_system = false
   and target_category.space_id = p_target_space_id
   and lower(trim(target_category.name)) = lower(trim(source_tx.name))
   and target_category.category_type = source_tx.category_type
  where t.id = source_tx.transaction_id;

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

revoke execute on function public.move_wallet_to_managed(uuid, uuid) from public;
grant execute on function public.move_wallet_to_managed(uuid, uuid) to authenticated;
