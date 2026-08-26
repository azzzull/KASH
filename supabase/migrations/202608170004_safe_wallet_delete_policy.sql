drop policy if exists "Users can delete own unused wallets" on public.wallets;
create policy "Users can delete own unused wallets"
on public.wallets for delete
to authenticated
using (
  auth.uid() = user_id
  and not exists (
    select 1
    from public.transactions t
    where t.wallet_id = wallets.id
      or t.destination_wallet_id = wallets.id
  )
  and not exists (
    select 1
    from public.goals g
    where g.wallet_id = wallets.id
  )
  and not exists (
    select 1
    from public.goal_contributions gc
    where gc.wallet_id = wallets.id
  )
);
