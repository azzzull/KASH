-- Existing virtual work funds are never assigned a physical account by
-- guesswork. The owner explicitly links one only when its remaining amount
-- is already present in the selected source account.
create or replace function public.link_legacy_work_fund_source(
  p_work_fund_id uuid,
  p_source_wallet_id uuid
)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_fund public.wallets%rowtype;
  v_source public.wallets%rowtype;
  v_remaining numeric;
  v_available numeric;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_fund
  from public.wallets
  where id = p_work_fund_id
    and user_id = v_user_id
    and work_fund_kind is not null
    and source_wallet_id is null
  for update;
  if not found then
    raise exception 'Unlinked work fund was not found';
  end if;

  if not exists (
    select 1
    from public.financial_spaces s
    where s.id = v_fund.space_id
      and s.owner_user_id = v_user_id
      and s.space_type = 'personal'
      and s.is_archived = false
  ) then
    raise exception 'Work fund must belong to your active Personal Space';
  end if;

  select * into v_source
  from public.wallets
  where id = p_source_wallet_id
    and user_id = v_user_id
    and space_id = v_fund.space_id
    and is_archived = false
    and work_fund_kind is null
    and wallet_type in ('bank', 'digital_bank', 'ewallet', 'cash')
  for update;
  if not found then
    raise exception 'Selected source wallet is not an active personal liquid wallet';
  end if;

  select current_balance into v_remaining
  from public.work_fund_summary_view
  where wallet_id = v_fund.id;

  select available_balance into v_available
  from public.wallet_balance_view
  where wallet_id = v_source.id;

  if coalesce(v_remaining, 0) > coalesce(v_available, 0) then
    raise exception 'The selected source wallet does not have enough available balance for this work fund';
  end if;

  update public.wallets
  set source_wallet_id = v_source.id
  where id = v_fund.id
  returning * into v_fund;

  return v_fund;
end;
$$;

revoke all on function public.link_legacy_work_fund_source(uuid, uuid) from public, anon;
grant execute on function public.link_legacy_work_fund_source(uuid, uuid) to authenticated;
