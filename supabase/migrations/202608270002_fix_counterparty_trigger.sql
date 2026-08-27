-- Fix column names for financial_spaces in trigger
create or replace function public.validate_counterparty_linked_space()
returns trigger as $$
declare
  v_linked_owner uuid;
begin
  if new.linked_space_id is not null then
    if new.linked_space_id = new.space_id then
      raise exception 'Counterparty cannot link to the same space it belongs to';
    end if;

    select owner_user_id into v_linked_owner
    from public.financial_spaces where id = new.linked_space_id;
    
    if not found then
      raise exception 'Linked space not found';
    end if;

    if v_linked_owner != new.user_id then
      raise exception 'Linked space must belong to the same user';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
