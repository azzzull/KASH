-- Add cross_space_event_id and cross_space_role to debt_progress_view

drop view if exists public.debt_progress_view cascade;

create or replace view public.debt_progress_view
with (security_invoker = true) as
select
  d.id as debt_id,
  d.user_id,
  d.counterparty_id,
  c.name as counterparty_name,
  d.type,
  d.title,
  d.original_amount,
  d.due_date,
  d.note,
  d.status,
  d.category_id,
  d.cross_space_event_id,
  d.cross_space_role,
  d.created_at,
  d.updated_at,
  coalesce(sum(dpa.allocated_amount), 0)::numeric(18,2) as total_paid,
  case
    when d.status = 'cancelled' then 0::numeric(18,2)
    else greatest(d.original_amount - coalesce(sum(dpa.allocated_amount), 0), 0)::numeric(18,2)
  end as remaining_amount,
  case
    when d.original_amount > 0 then least((coalesce(sum(dpa.allocated_amount), 0) / d.original_amount) * 100, 100)::numeric(5,2)
    else 0::numeric(5,2)
  end as percentage
from public.debts d
join public.counterparties c on c.id = d.counterparty_id
left join public.debt_payment_allocations dpa on dpa.debt_id = d.id
group by d.id, c.name;

-- Recreate counterparty_summary_view

create or replace view public.counterparty_summary_view
with (security_invoker = true) as
with item_totals as (
  select
    d.user_id,
    d.counterparty_id,
    d.type as debt_type,
    coalesce(sum(d.original_amount), 0)::numeric(18,2) as total_original,
    coalesce(sum(dpv.total_paid), 0)::numeric(18,2) as total_paid,
    coalesce(sum(dpv.remaining_amount), 0)::numeric(18,2) as remaining_amount,
    count(case when d.status in ('active', 'partially_paid') then 1 end)::int as active_item_count,
    count(case when d.status = 'settled' then 1 end)::int as settled_item_count,
    count(d.id)::int as total_item_count
  from public.debts d
  join public.debt_progress_view dpv on dpv.debt_id = d.id
  group by d.user_id, d.counterparty_id, d.type
)
select
  c.id as counterparty_id,
  c.user_id,
  c.name as counterparty_name,
  t.debt_type,
  coalesce(t.total_original, 0)::numeric(18,2) as total_original,
  coalesce(t.total_paid, 0)::numeric(18,2) as total_paid,
  coalesce(t.remaining_amount, 0)::numeric(18,2) as remaining_amount,
  coalesce(t.active_item_count, 0)::int as active_item_count,
  coalesce(t.settled_item_count, 0)::int as settled_item_count,
  coalesce(t.total_item_count, 0)::int as total_item_count,
  c.created_at,
  c.updated_at
from public.counterparties c
left join item_totals t on t.counterparty_id = c.id;
