-- Fix column names for financial_spaces in trigger
create or replace function public.validate_cross_space_transaction()
returns trigger as $$
declare
  v_event public.cross_space_events%ROWTYPE;
  v_space_type text;
begin
  if (new.cross_space_event_id is null) != (new.cross_space_role is null) then
    raise exception 'cross_space_event_id and cross_space_role must be provided together';
  end if;

  if new.cross_space_event_id is not null then
    select * into v_event from public.cross_space_events where id = new.cross_space_event_id;
    if not found then raise exception 'cross space event not found'; end if;
    if new.user_id != v_event.user_id then raise exception 'user id mismatch with event'; end if;

    select space_type into v_space_type from public.financial_spaces where id = new.space_id;

    if new.cross_space_role = 'managed_spending' then
      if new.wallet_id is not null then raise exception 'managed_spending must have null wallet'; end if;
      if new.destination_wallet_id is not null then raise exception 'managed_spending must have null destination_wallet_id'; end if;
      if new.type != 'expense' then raise exception 'managed_spending must be expense'; end if;
      if new.space_id != v_event.managed_space_id then raise exception 'managed_spending space mismatch'; end if;
      if v_space_type != 'managed' then raise exception 'managed_spending space must be managed'; end if;
      if v_event.event_type != 'managed_expense_paid_personally' then raise exception 'invalid event type'; end if;
      if new.amount != v_event.amount then raise exception 'managed_spending amount must match event amount'; end if;
      
    elsif new.cross_space_role = 'personal_cash_out' then
      if new.wallet_id is null then raise exception 'personal_cash_out must have wallet'; end if;
      if new.destination_wallet_id is not null then raise exception 'personal_cash_out must have null destination_wallet_id'; end if;
      if new.type != 'adjustment' then raise exception 'personal_cash_out must be adjustment'; end if;
      if new.space_id != v_event.personal_space_id then raise exception 'personal_cash_out space mismatch'; end if;
      if new.amount != -v_event.amount then raise exception 'personal_cash_out amount must be negative event amount'; end if;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security invoker;
