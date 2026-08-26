-- ============================================================
-- Fix: process_recurring_reminders p_current_date parameter
-- Allows passing explicit date for testing / simulation while
-- defaulting to user profile timezone date during live cron
-- ============================================================

create or replace function public.process_recurring_reminders(
  p_current_date date default null
)
returns table (
  notification_id uuid,
  user_id uuid,
  title text,
  message text,
  target_path text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_offset integer;
  v_days_diff integer;
  v_notif_type text;
  v_title text;
  v_message text;
  v_target_path text;
  v_notif_id uuid;
  v_user_today date;
begin
  -- Loop through active obligations and their open (pending/overdue) payments
  for v_payment in
    select
      p.id as payment_id,
      p.user_id,
      p.due_date,
      p.amount,
      p.installment_number,
      o.id as obligation_id,
      o.name as obligation_name,
      o.provider,
      o.type as obligation_type,
      o.reminder_offsets,
      o.overdue_reminder_enabled,
      coalesce(prof.timezone, 'Asia/Jakarta') as user_timezone
    from public.recurring_payments p
    join public.recurring_obligations o on o.id = p.obligation_id
    join public.profiles prof on prof.id = p.user_id
    where o.status = 'active'
      and p.status in ('pending', 'overdue')
  loop
    -- Calculate user local current date based on their profile timezone or supplied override date
    v_user_today := coalesce(p_current_date, (now() at time zone v_payment.user_timezone)::date);
    v_days_diff := (v_payment.due_date - v_user_today);

    -- Check configured upcoming reminder offsets (e.g. 7, 3, 1, 0)
    if v_payment.reminder_offsets is not null then
      foreach v_offset in array v_payment.reminder_offsets loop
        if v_days_diff = v_offset then
          -- Attempt to claim reminder atomically via unique constraint
          begin
            insert into public.notification_reminder_logs (
              user_id,
              obligation_id,
              payment_id,
              reminder_offset,
              due_date
            ) values (
              v_payment.user_id,
              v_payment.obligation_id,
              v_payment.payment_id,
              v_offset,
              v_payment.due_date
            );

            -- Determine notification content
            if v_offset = 0 then
              if v_payment.obligation_type in ('paylater', 'installment') then
                v_notif_type := 'installment_due_today';
                v_title := 'Installment due today';
                v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due today.';
              else
                v_notif_type := 'subscription_due_today';
                v_title := 'Subscription due today';
                v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due today.';
              end if;
            else
              if v_payment.obligation_type in ('paylater', 'installment') then
                v_notif_type := 'installment_due_soon';
                v_title := 'Installment due soon';
                v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due in ' || v_offset || ' days.';
              else
                v_notif_type := 'subscription_due_soon';
                v_title := 'Subscription due soon';
                v_message := v_payment.obligation_name || ' (Rp' || to_char(v_payment.amount, 'FM999,999,999,999') || ') is due in ' || v_offset || ' days.';
              end if;
            end if;

            v_target_path := '/subscriptions/' || v_payment.obligation_id;

            -- Create in-app notification record
            v_notif_id := public.create_notification(
              v_payment.user_id,
              v_notif_type,
              v_title,
              v_message,
              'recurring_obligation',
              v_payment.obligation_id,
              jsonb_build_object(
                'obligation_id', v_payment.obligation_id,
                'payment_id', v_payment.payment_id,
                'amount', v_payment.amount,
                'due_date', v_payment.due_date,
                'target_path', v_target_path
              )
            );

            -- Update log with created notification ID
            update public.notification_reminder_logs
            set notification_id = v_notif_id
            where payment_id = v_payment.payment_id and reminder_offset = v_offset and due_date = v_payment.due_date;

            notification_id := v_notif_id;
            user_id := v_payment.user_id;
            title := v_title;
            message := v_message;
            target_path := v_target_path;
            return next;

          exception when unique_violation then
            -- Already sent, ignore deduplicated reminder
            null;
          end;
        end if;
      end loop;
    end if;

    -- Check overdue reminder if enabled
    if v_payment.overdue_reminder_enabled and v_days_diff < 0 then
      begin
        insert into public.notification_reminder_logs (
          user_id,
          obligation_id,
          payment_id,
          reminder_offset,
          due_date
        ) values (
          v_payment.user_id,
          v_payment.obligation_id,
          v_payment.payment_id,
          -1, -- Overdue offset
          v_payment.due_date
        );

        if v_payment.obligation_type in ('paylater', 'installment') then
          v_notif_type := 'installment_overdue';
          v_title := 'Installment overdue';
          v_message := v_payment.obligation_name || ' was due on ' || to_char(v_payment.due_date, 'DD Mon YYYY') || '.';
        else
          v_notif_type := 'subscription_overdue';
          v_title := 'Payment overdue';
          v_message := v_payment.obligation_name || ' was due on ' || to_char(v_payment.due_date, 'DD Mon YYYY') || '.';
        end if;

        v_target_path := '/subscriptions/' || v_payment.obligation_id;

        v_notif_id := public.create_notification(
          v_payment.user_id,
          v_notif_type,
          v_title,
          v_message,
          'recurring_obligation',
          v_payment.obligation_id,
          jsonb_build_object(
            'obligation_id', v_payment.obligation_id,
            'payment_id', v_payment.payment_id,
            'amount', v_payment.amount,
            'due_date', v_payment.due_date,
            'target_path', v_target_path
          )
        );

        update public.notification_reminder_logs
        set notification_id = v_notif_id
        where payment_id = v_payment.payment_id and reminder_offset = -1 and due_date = v_payment.due_date;

        notification_id := v_notif_id;
        user_id := v_payment.user_id;
        title := v_title;
        message := v_message;
        target_path := v_target_path;
        return next;

      exception when unique_violation then
        -- Already logged, do not spam
        null;
      end;
    end if;

  end loop;
end;
$$;
