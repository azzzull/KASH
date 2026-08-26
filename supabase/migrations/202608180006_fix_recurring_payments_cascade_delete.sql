-- ============================================================
-- Fix Foreign Key Constraint for Recurring Obligations Delete
-- Changes ON DELETE RESTRICT to ON DELETE CASCADE on recurring_payments
-- Adds atomic RPC public.delete_recurring_obligation(p_obligation_id)
-- ============================================================

-- 1. Update recurring_payments foreign key to ON DELETE CASCADE
alter table public.recurring_payments
drop constraint if exists recurring_payments_obligation_id_fkey;

alter table public.recurring_payments
add constraint recurring_payments_obligation_id_fkey
foreign key (obligation_id)
references public.recurring_obligations(id)
on delete cascade;

-- 2. Create atomic deletion RPC
create or replace function public.delete_recurring_obligation(
  p_obligation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Verify ownership
  if not exists (
    select 1 from public.recurring_obligations
    where id = p_obligation_id and user_id = v_user_id
  ) then
    raise exception 'Obligation not found or unauthorized';
  end if;

  -- Delete reminder logs
  delete from public.notification_reminder_logs
  where obligation_id = p_obligation_id and user_id = v_user_id;

  -- Delete occurrences
  delete from public.recurring_payments
  where obligation_id = p_obligation_id and user_id = v_user_id;

  -- Delete the obligation
  delete from public.recurring_obligations
  where id = p_obligation_id and user_id = v_user_id;

  return true;
end;
$$;
