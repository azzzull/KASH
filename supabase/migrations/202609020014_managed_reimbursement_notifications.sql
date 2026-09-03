-- Managed reimbursement notifications are generated from authoritative rows.
-- Notification failures are isolated so finance operations can never roll back.

alter table public.notifications
  add column if not exists source_key text;

create unique index if not exists notifications_source_key_uidx
  on public.notifications (source_key)
  where source_key is not null;

create or replace function public.managed_reimbursement_notification_amount(p_amount numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'Rp' || replace(to_char(round(coalesce(p_amount, 0)), 'FM999,999,999,999,999,990'), ',', '.')
$$;

create or replace function public.notify_managed_reimbursement_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.cross_space_events%rowtype;
  v_space_name text;
  v_requester_name text;
  v_recipient record;
  v_is_english boolean;
  v_amount text;
begin
  if new.cross_space_role <> 'managed_payable' then
    return new;
  end if;

  begin
    select * into v_event
    from public.cross_space_events
    where id = new.cross_space_event_id
      and event_type = 'managed_expense_paid_personally';

    if not found then
      return new;
    end if;

    select name into v_space_name
    from public.financial_spaces
    where id = v_event.managed_space_id;

    select coalesce(nullif(trim(full_name), ''), 'Pengguna') into v_requester_name
    from public.profiles
    where id = v_event.user_id;

    v_amount := public.managed_reimbursement_notification_amount(v_event.amount);

    for v_recipient in
      select m.user_id, p.locale
      from public.managed_space_members m
      join public.profiles p on p.id = m.user_id
      where m.space_id = v_event.managed_space_id
        and m.status = 'active'
        and m.role in ('owner', 'admin')
        and m.user_id <> v_event.user_id
    loop
      v_is_english := lower(coalesce(v_recipient.locale, 'id')) like 'en%';

      insert into public.notifications (
        user_id, type, title, message, entity_type, entity_id, metadata, source_key
      ) values (
        v_recipient.user_id,
        'managed_reimbursement_created',
        case when v_is_english then 'New reimbursement' else 'Reimbursement baru' end,
        case when v_is_english
          then v_requester_name || ' requested reimbursement of ' || v_amount || ' in ' || coalesce(v_space_name, 'Managed Space') || '.'
          else v_requester_name || ' mengajukan reimbursement ' || v_amount || ' di ' || coalesce(v_space_name, 'Managed Space') || '.'
        end,
        'counterparty',
        new.counterparty_id,
        jsonb_build_object(
          'managed_space_id', v_event.managed_space_id,
          'cross_space_event_id', v_event.id,
          'managed_payable_id', new.id,
          'requester_user_id', v_event.user_id,
          'requester_name', v_requester_name,
          'amount', v_event.amount,
          'space_name', v_space_name,
          'target_space_id', v_event.managed_space_id,
          'target_path', '/debts/' || new.counterparty_id::text || '?space_id=' || v_event.managed_space_id::text
        ),
        'managed_reimbursement_created:' || v_event.id::text || ':' || v_recipient.user_id::text
      ) on conflict (source_key) where source_key is not null do nothing;
    end loop;
  exception when others then
    raise warning 'Managed reimbursement creation notification failed for debt %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_managed_reimbursement_created on public.debts;
create trigger trg_notify_managed_reimbursement_created
after insert on public.debts
for each row
execute function public.notify_managed_reimbursement_created();

create or replace function public.notify_managed_reimbursement_settlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.cross_space_events%rowtype;
  v_recipient_counterparty_id uuid;
  v_space_name text;
  v_actor_name text;
  v_recipient_locale text;
  v_is_english boolean;
  v_total_settled numeric;
  v_remaining numeric;
  v_amount text;
  v_remaining_amount text;
begin
  begin
    select * into v_event
    from public.cross_space_events
    where id = new.event_id
      and event_type = 'managed_expense_paid_personally';

    if not found or v_event.user_id = auth.uid() then
      return new;
    end if;

    select counterparty_id into v_recipient_counterparty_id
    from public.debts
    where cross_space_event_id = v_event.id
      and cross_space_role = 'personal_receivable';

    if v_recipient_counterparty_id is null then
      raise warning 'Personal receivable counterparty missing for reimbursement event %', v_event.id;
      return new;
    end if;

    select coalesce(sum(amount), 0) into v_total_settled
    from public.cross_space_settlements
    where event_id = v_event.id
      and status = 'completed';

    v_remaining := greatest(0, v_event.amount - v_total_settled);

    select name into v_space_name from public.financial_spaces where id = v_event.managed_space_id;
    select coalesce(nullif(trim(full_name), ''), 'Pengguna') into v_actor_name
    from public.profiles where id = auth.uid();
    select locale into v_recipient_locale from public.profiles where id = v_event.user_id;

    v_is_english := lower(coalesce(v_recipient_locale, 'id')) like 'en%';
    v_amount := public.managed_reimbursement_notification_amount(new.amount);
    v_remaining_amount := public.managed_reimbursement_notification_amount(v_remaining);

    insert into public.notifications (
      user_id, type, title, message, entity_type, entity_id, metadata, source_key
    ) values (
      v_event.user_id,
      case when v_remaining = 0 then 'managed_reimbursement_paid' else 'managed_reimbursement_partially_paid' end,
      case
        when v_remaining = 0 and v_is_english then 'Reimbursement paid'
        when v_remaining = 0 then 'Reimbursement berhasil dibayar'
        when v_is_english then 'Reimbursement partially paid'
        else 'Reimbursement dibayar sebagian'
      end,
      case
        when v_remaining = 0 and v_is_english then 'Your reimbursement of ' || public.managed_reimbursement_notification_amount(v_event.amount) || ' in ' || coalesce(v_space_name, 'Managed Space') || ' was paid by ' || v_actor_name || '.'
        when v_remaining = 0 then 'Reimbursement ' || public.managed_reimbursement_notification_amount(v_event.amount) || ' kamu di ' || coalesce(v_space_name, 'Managed Space') || ' telah dibayar oleh ' || v_actor_name || '.'
        when v_is_english then v_actor_name || ' paid ' || v_amount || ' of your reimbursement in ' || coalesce(v_space_name, 'Managed Space') || '. Remaining ' || v_remaining_amount || '.'
        else v_actor_name || ' membayar ' || v_amount || ' dari reimbursement kamu di ' || coalesce(v_space_name, 'Managed Space') || '. Sisa ' || v_remaining_amount || '.'
      end,
      'counterparty',
      v_recipient_counterparty_id,
      jsonb_build_object(
        'managed_space_id', v_event.managed_space_id,
        'cross_space_event_id', v_event.id,
        'settlement_id', new.id,
        'recipient_user_id', v_event.user_id,
        'settled_by_user_id', auth.uid(),
        'settled_by_name', v_actor_name,
        'amount', new.amount,
        'remaining_amount', v_remaining,
        'space_name', v_space_name,
        'target_space_id', v_event.personal_space_id,
        'target_path', '/debts/' || v_recipient_counterparty_id::text || '?space_id=' || v_event.personal_space_id::text
      ),
      'managed_reimbursement_settlement:' || new.id::text || ':' || v_event.user_id::text
    ) on conflict (source_key) where source_key is not null do nothing;
  exception when others then
    raise warning 'Managed reimbursement settlement notification failed for settlement %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_managed_reimbursement_settlement on public.cross_space_settlements;
create trigger trg_notify_managed_reimbursement_settlement
after insert on public.cross_space_settlements
for each row
execute function public.notify_managed_reimbursement_settlement();
