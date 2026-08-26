-- ============================================================
-- KASH: Function Linter Security Hardening
--
-- Safe-only fixes:
-- - Pin search_path on trigger/helper functions reported mutable.
-- - Revoke anon/public execution from RPCs that require signed-in users.
-- - Revoke anon/authenticated execution from internal trigger/setup helpers.
--
-- Intentionally keeps authenticated EXECUTE on app-facing SECURITY DEFINER
-- RPCs that perform their own auth.uid() and ownership checks.
-- ============================================================

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.validate_transaction_relationships()',
    'public.set_updated_at()',
    'public.validate_goal_contribution_relationships()',
    'public.prevent_goal_contribution_transaction_mutation()',
    'public.handle_notification_read_state()',
    'public.calculate_next_billing_date(date, text, integer)',
    'public.record_counterparty_settlement(uuid, public.debt_type, public.payment_mode, numeric, uuid, timestamp with time zone, text, uuid)',
    'public.validate_budget_category_assignment(uuid, uuid, uuid, date, date)',
    'public.validate_investment_activity()'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format('alter function %s set search_path = public', v_signature);
    end if;
  end loop;
end;
$$;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.validate_transaction_relationships()',
    'public.set_updated_at()',
    'public.validate_goal_contribution_relationships()',
    'public.prevent_goal_contribution_transaction_mutation()',
    'public.handle_notification_read_state()',
    'public.validate_budget_category_assignment(uuid, uuid, uuid, date, date)',
    'public.validate_investment_activity()',
    'public.dispatch_notification_push_trigger()',
    'public.evaluate_budget_threshold_notifications()',
    'public.handle_new_user()',
    'public.invoke_process_reminders_cron()',
    'public.process_recurring_reminders(date)',
    'public.get_cron_job_info()',
    'public.get_cron_run_history()',
    'public.setup_kash_vault_secrets(text, text)',
    'public.setup_kash_push_vault_secret(text)',
    'public.setup_kash_notification_push_dispatch(text, text)',
    'public.dispatch_pending_notification_pushes(integer)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', v_signature);
    end if;
  end loop;
end;
$$;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.setup_kash_vault_secrets(text, text)',
    'public.setup_kash_push_vault_secret(text)',
    'public.setup_kash_notification_push_dispatch(text, text)',
    'public.dispatch_pending_notification_pushes(integer)',
    'public.invoke_process_reminders_cron()',
    'public.process_recurring_reminders(date)',
    'public.get_cron_job_info()',
    'public.get_cron_run_history()'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format('grant execute on function %s to service_role', v_signature);
    end if;
  end loop;
end;
$$;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.can_view_profile(uuid, uuid)',
    'public.cancel_recurring_obligation(uuid)',
    'public.cancel_shared_request(uuid)',
    'public.check_shared_approver_permission(uuid, uuid)',
    'public.clear_read_notifications()',
    'public.close_goal_with_sweep(uuid, uuid)',
    'public.create_budget_target(text, text, numeric, date, boolean, boolean, uuid, uuid, uuid, uuid, uuid, uuid, text)',
    'public.create_goal_contribution(uuid, uuid, numeric, timestamp with time zone, text)',
    'public.create_goal_with_pocket(text, numeric, date, text, text, text)',
    'public.create_recurring_obligation(text, text, numeric, date, text, text, uuid, uuid, integer[], boolean, numeric, integer, integer, text)',
    'public.create_shared_savings(text, numeric, date, text, text)',
    'public.delete_recurring_obligation(uuid)',
    'public.get_monthly_budget_overview(date)',
    'public.get_monthly_budget_progress(date, uuid)',
    'public.invite_shared_savings_member(uuid, text)',
    'public.is_shared_savings_member(uuid, uuid)',
    'public.is_shared_savings_owner(uuid, uuid)',
    'public.mark_all_notifications_read()',
    'public.mark_notification_read(uuid)',
    'public.record_recurring_payment(uuid, text, uuid, timestamp with time zone, text)',
    'public.reject_shared_request(uuid, text)',
    'public.remove_shared_savings_member(uuid, uuid)',
    'public.respond_shared_savings_invite(uuid, text)',
    'public.set_shared_savings_account_holder(uuid, uuid)',
    'public.set_shared_savings_approver(uuid, uuid, boolean)',
    'public.settle_remaining_installment(uuid, text, uuid, timestamp with time zone, text)',
    'public.record_counterparty_settlement(uuid, public.debt_type, public.payment_mode, numeric, uuid, timestamp with time zone, text, uuid)',
    'public.upsert_push_subscription(text, text, text, text, text)',
    'public.update_investment_valuation(uuid, numeric, timestamp with time zone, text)',
    'public.approve_shared_contribution(uuid)',
    'public.approve_shared_withdrawal(uuid)',
    'public.approve_shared_spending(uuid)',
    'public.submit_shared_contribution_request(uuid, uuid, numeric, text)',
    'public.submit_shared_withdrawal_request(uuid, uuid, numeric, text)',
    'public.submit_shared_spending_request(uuid, text, numeric, text)',
    'public.transfer_shared_savings_ownership(uuid, uuid)',
    'public.update_shared_savings_settings(uuid, text, numeric, date, text, text)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      execute format('revoke execute on function %s from public, anon', v_signature);
      execute format('grant execute on function %s to authenticated', v_signature);
    end if;
  end loop;
end;
$$;
