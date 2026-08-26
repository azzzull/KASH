-- ============================================================
-- Migration: 202608250003_managed_space_hard_delete.sql
-- Allows hard deleting a Managed Space and cascading removal.
-- ============================================================

create or replace function public.delete_managed_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_type text;
  v_owner_id uuid;
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

  -- FK constraints for wallets, transactions, categories, budgets, envelopes, goals, 
  -- counterparties, debts, recurring_obligations are already ON DELETE CASCADE.
  -- Deleting the space will atomically clean up all scoped data.
  delete from public.financial_spaces where id = p_space_id;
end;
$$;
