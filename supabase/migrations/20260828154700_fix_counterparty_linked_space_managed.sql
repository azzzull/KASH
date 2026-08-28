-- Fix: allow counterparty linked_space_id to reference a Managed Space
-- for which the counterparty's user_id is an active owner/admin/member.
-- Preserve strict Personal-to-Personal ownership rule.
--
-- Root cause: validate_counterparty_linked_space() checked
--   financial_spaces.owner_user_id = new.user_id
-- which always fails when a non-owner member (e.g. Account B, Member of Kantor)
-- creates a reimbursement linking their Personal Space to a Managed Space
-- they do not own but are an active member of.

create or replace function public.validate_counterparty_linked_space()
returns trigger as $$
declare
  v_linked_type   text;
  v_linked_owner  uuid;
begin
  if new.linked_space_id is null then
    return new;
  end if;

  -- Cannot link to the same space the counterparty belongs to
  if new.linked_space_id = new.space_id then
    raise exception 'Counterparty cannot link to the same space it belongs to';
  end if;

  -- Fetch linked space metadata
  select space_type, owner_user_id
    into v_linked_type, v_linked_owner
    from public.financial_spaces
   where id = new.linked_space_id;

  if not found then
    raise exception 'Linked space not found';
  end if;

  if v_linked_type = 'personal' then
    -- Personal linked space: strict ownership required (preserve existing behavior)
    if v_linked_owner != new.user_id then
      raise exception 'Linked space must belong to the same user';
    end if;

  elsif v_linked_type = 'managed' then
    -- Managed linked space: user must be an active owner/admin/member.
    -- Direct membership check on new.user_id so this trigger is correct
    -- even in security-definer contexts where auth.uid() may differ.
    if not exists (
      select 1
        from public.managed_space_members m
       where m.space_id = new.linked_space_id
         and m.user_id  = new.user_id
         and m.status   = 'active'
         and m.role = any(array['owner','admin','member']::public.managed_space_role[])
    ) then
      raise exception 'User is not an active member of the linked managed space';
    end if;

  else
    raise exception 'Unsupported linked space type: %', v_linked_type;
  end if;

  return new;
end;
$$ language plpgsql security definer;
