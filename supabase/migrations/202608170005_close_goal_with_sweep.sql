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
    and user_id = current_user_id
  for update;

  if goal_record.id is null then
    raise exception 'Goal not found.';
  end if;

  if goal_record.status = 'cancelled' then
    raise exception 'Goal is already cancelled/closed.';
  end if;

  if goal_record.wallet_id is null then
    raise exception 'Goal does not have a linked pocket wallet.';
  end if;

  select *
  into pocket_wallet_record
  from public.wallets
  where id = goal_record.wallet_id
    and user_id = current_user_id
  for update;

  if pocket_wallet_record.id is null then
    raise exception 'Goal pocket wallet not found.';
  end if;

  select coalesce(current_balance, 0)
  into pocket_balance
  from public.wallet_balance_view
  where wallet_id = goal_record.wallet_id
    and user_id = current_user_id;

  if pocket_balance is null then
    pocket_balance := 0;
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
      and user_id = current_user_id
      and is_archived = false
    for update;

    if dest_wallet_record.id is null then
      raise exception 'Destination wallet not found or is archived.';
    end if;

    insert into public.transactions (
      user_id,
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
      'transfer',
      pocket_balance,
      goal_record.wallet_id,
      dest_wallet_record.id,
      0,
      now(),
      'Goal Closed: ' || goal_record.name,
      'Remaining balance transferred upon closing goal',
      'completed',
      'goal_refund',
      goal_record.id
    )
    returning id into created_transaction_id;
  end if;

  update public.goals
  set status = 'cancelled',
      updated_at = now()
  where id = goal_record.id;

  update public.wallets
  set is_archived = true,
      updated_at = now()
  where id = goal_record.wallet_id;

  return jsonb_build_object(
    'goal_id', goal_record.id,
    'status', 'cancelled',
    'swept_amount', pocket_balance,
    'destination_wallet_id', p_destination_wallet_id,
    'transaction_id', created_transaction_id
  );
end;
$$;

grant execute on function public.close_goal_with_sweep(uuid, uuid) to authenticated;
