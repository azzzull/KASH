-- Fix validate_cross_space_debt_payment
create or replace function public.validate_cross_space_debt_payment()
returns trigger as $$
declare
  v_settlement public.cross_space_settlements%ROWTYPE;
begin
  if (new.cross_space_settlement_id is null) != (new.cross_space_role is null) then
    raise exception 'cross_space_settlement_id and cross_space_role must be provided together';
  end if;

  if new.cross_space_settlement_id is not null then
    select * into v_settlement from public.cross_space_settlements where id = new.cross_space_settlement_id;
    if not found then raise exception 'settlement not found'; end if;
    if new.user_id != v_settlement.user_id then raise exception 'user mismatch'; end if;
    if new.total_amount != v_settlement.amount then raise exception 'amount mismatch'; end if;
    
    -- We cannot validate debt_id here because debt_payments doesn't have it.
    -- The validation for debt_role vs payment_role will rely on application logic.
  end if;
  return new;
end;
$$ language plpgsql security definer;
