-- The conversion changes an existing Work expense into the personal
-- receivable cash-out. That update is intentional and must run under the
-- same guard used by record_contextual_expense.

alter function public.convert_expense_to_managed_reimbursement(
  numeric, uuid, uuid, uuid, text, uuid, uuid, text, timestamptz
) rename to convert_expense_to_managed_reimbursement_internal;

revoke all on function public.convert_expense_to_managed_reimbursement_internal(
  numeric, uuid, uuid, uuid, text, uuid, uuid, text, timestamptz
) from public, anon, authenticated;

create function public.convert_expense_to_managed_reimbursement(
  p_amount numeric,
  p_client_request_id uuid,
  p_managed_category_id uuid,
  p_managed_space_id uuid,
  p_note text,
  p_personal_wallet_id uuid,
  p_source_transaction_id uuid,
  p_title text,
  p_transaction_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('kash.contextual_expense_write', 'on', true);

  return public.convert_expense_to_managed_reimbursement_internal(
    p_amount,
    p_client_request_id,
    p_managed_category_id,
    p_managed_space_id,
    p_note,
    p_personal_wallet_id,
    p_source_transaction_id,
    p_title,
    p_transaction_date
  );
end;
$$;

revoke all on function public.convert_expense_to_managed_reimbursement(
  numeric, uuid, uuid, uuid, text, uuid, uuid, text, timestamptz
) from public, anon;
grant execute on function public.convert_expense_to_managed_reimbursement(
  numeric, uuid, uuid, uuid, text, uuid, uuid, text, timestamptz
) to authenticated;
