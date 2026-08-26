-- Drop and recreate recurring_obligations_summary_view to include space_id cleanly
-- and update create_recurring_obligation RPC with space_id parameter

drop view if exists public.recurring_obligations_summary_view;

create view public.recurring_obligations_summary_view
with (security_invoker = true) as
select
  o.id,
  o.user_id,
  o.space_id,
  o.type,
  o.name,
  o.provider,
  o.amount,
  o.category_id,
  o.frequency,
  o.billing_day,
  o.start_date,
  o.end_date,
  o.next_due_date,
  o.status,
  o.default_wallet_id,
  o.reminder_offsets,
  o.overdue_reminder_enabled,
  o.installment_total_amount,
  o.installment_count,
  o.note,
  o.created_at,
  o.updated_at,
  coalesce(count(p.id) filter (where p.status = 'paid'), 0)::integer as paid_count,
  case
    when o.type in ('paylater', 'installment') then
      greatest(coalesce(o.installment_count, 0) - coalesce(count(p.id) filter (where p.status = 'paid'), 0), 0)::integer
    else 0
  end as remaining_count,
  coalesce(sum(p.amount) filter (where p.status = 'paid'), 0)::numeric(18,2) as total_paid_amount,
  case
    when o.type in ('paylater', 'installment') then
      greatest(coalesce(o.installment_total_amount, 0) - coalesce(sum(p.amount) filter (where p.status = 'paid'), 0), 0)::numeric(18,2)
    else 0
  end as remaining_amount,
  case
    when o.type in ('paylater', 'installment') and coalesce(o.installment_count, 0) > 0 then
      round((coalesce(count(p.id) filter (where p.status = 'paid'), 0)::numeric / o.installment_count::numeric) * 100, 2)
    else 0
  end as progress_percentage
from public.recurring_obligations o
left join public.recurring_payments p on p.obligation_id = o.id
group by o.id;

create or replace function public.create_recurring_obligation(
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
  v_billing_day integer;
  v_first_due_date date;
  v_i integer;
  v_resolved_space_id uuid;
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
  v_first_due_date := p_start_date;

  -- Create obligation record
  insert into public.recurring_obligations (
    user_id,
    space_id,
    type,
    name,
    provider,
    amount,
    category_id,
    frequency,
    billing_day,
    start_date,
    next_due_date,
    status,
    default_wallet_id,
    reminder_offsets,
    overdue_reminder_enabled,
    installment_total_amount,
    installment_count,
    note
  ) values (
    v_user_id,
    v_resolved_space_id,
    p_type,
    p_name,
    p_provider,
    p_amount,
    p_category_id,
    p_frequency,
    v_billing_day,
    p_start_date,
    v_first_due_date,
    'active',
    p_default_wallet_id,
    coalesce(p_reminder_offsets, '{7,3,1,0}'::integer[]),
    coalesce(p_overdue_reminder_enabled, true),
    p_installment_total_amount,
    p_installment_count,
    p_note
  ) returning id into v_obligation_id;

  -- If installment with already paid occurrences, insert auditable historical payments
  if p_type in ('paylater', 'installment') and coalesce(p_already_paid_count, 0) > 0 then
    for v_i in 1..least(p_already_paid_count, p_installment_count) loop
      insert into public.recurring_payments (
        user_id,
        obligation_id,
        due_date,
        amount,
        status,
        paid_at,
        payment_mode,
        installment_number,
        note
      ) values (
        v_user_id,
        v_obligation_id,
        p_start_date,
        p_amount,
        'paid',
        p_start_date::timestamp with time zone,
        'other',
        v_i,
        'Initial setup: marked as already paid'
      );
    end loop;
  end if;

  -- Generate future payment occurrences
  perform public.generate_recurring_occurrences(v_obligation_id);

  return v_obligation_id;
end;
$$;

grant execute on function public.create_recurring_obligation(text, text, numeric, date, text, text, uuid, uuid, integer[], boolean, numeric, integer, integer, text, uuid) to authenticated;
