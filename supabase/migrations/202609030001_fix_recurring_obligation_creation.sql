-- Restore the recurring-obligation creation RPC without relying on a missing
-- occurrence generator. Keep one unambiguous, space-aware RPC signature.

drop function if exists public.create_recurring_obligation(
  text, text, numeric, date, text, text, uuid, uuid, integer[], boolean,
  numeric, integer, integer, text
);

drop function if exists public.create_recurring_obligation(
  text, text, numeric, date, text, text, uuid, uuid, integer[], boolean,
  numeric, integer, integer, text, uuid
);

create function public.create_recurring_obligation(
  p_type text,
  p_name text,
  p_amount numeric,
  p_start_date date,
  p_frequency text default 'monthly',
  p_provider text default null,
  p_category_id uuid default null,
  p_default_wallet_id uuid default null,
  p_reminder_offsets integer[] default '{7,3,1,0}'::integer[],
  p_overdue_reminder_enabled boolean default true,
  p_installment_total_amount numeric default null,
  p_installment_count integer default null,
  p_already_paid_count integer default 0,
  p_note text default null,
  p_space_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_obligation_id uuid;
  v_resolved_space_id uuid;
  v_billing_day integer;
  v_i integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if p_space_id is not null then
    select id into v_resolved_space_id
    from public.financial_spaces
    where id = p_space_id and owner_user_id = v_user_id;

    if v_resolved_space_id is null then
      raise exception 'Invalid financial space.';
    end if;
  else
    select id into v_resolved_space_id
    from public.financial_spaces
    where owner_user_id = v_user_id and space_type = 'personal'
    limit 1;
  end if;

  v_billing_day := extract(day from p_start_date)::integer;

  insert into public.recurring_obligations (
    user_id, space_id, type, name, provider, amount, category_id, frequency,
    billing_day, start_date, next_due_date, status, default_wallet_id,
    reminder_offsets, overdue_reminder_enabled, installment_total_amount,
    installment_count, note
  ) values (
    v_user_id, v_resolved_space_id, p_type, p_name, p_provider, p_amount,
    p_category_id, p_frequency, v_billing_day, p_start_date, p_start_date,
    'active', p_default_wallet_id,
    coalesce(p_reminder_offsets, '{7,3,1,0}'::integer[]),
    coalesce(p_overdue_reminder_enabled, true), p_installment_total_amount,
    p_installment_count, p_note
  ) returning id into v_obligation_id;

  if p_type in ('paylater', 'installment') and coalesce(p_already_paid_count, 0) > 0 then
    for v_i in 1..least(p_already_paid_count, p_installment_count) loop
      insert into public.recurring_payments (
        user_id, obligation_id, due_date, amount, status, paid_at,
        payment_mode, installment_number, note
      ) values (
        v_user_id, v_obligation_id,
        (p_start_date - ((p_already_paid_count - v_i + 1) * interval '1 month'))::date,
        p_amount, 'paid', now(), 'historical', v_i,
        'Initial historical record'
      );
    end loop;

    if p_already_paid_count >= p_installment_count then
      update public.recurring_obligations
      set status = 'completed', next_due_date = null, updated_at = now()
      where id = v_obligation_id;
      return v_obligation_id;
    end if;
  end if;

  insert into public.recurring_payments (
    user_id, obligation_id, due_date, amount, status, installment_number
  ) values (
    v_user_id, v_obligation_id, p_start_date, p_amount, 'pending',
    case
      when p_type in ('paylater', 'installment') then coalesce(p_already_paid_count, 0) + 1
      else null
    end
  );

  return v_obligation_id;
end;
$$;

grant execute on function public.create_recurring_obligation(
  text, text, numeric, date, text, text, uuid, uuid, integer[], boolean,
  numeric, integer, integer, text, uuid
) to authenticated;
