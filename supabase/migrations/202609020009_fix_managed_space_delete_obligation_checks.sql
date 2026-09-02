create or replace function public.delete_managed_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_space_type public.financial_space_type;
  v_owner_user_id uuid;
  v_deleted_at timestamptz;
begin
  select
    fs.space_type,
    fs.owner_user_id,
    fs.deleted_at
  into
    v_space_type,
    v_owner_user_id,
    v_deleted_at
  from public.financial_spaces fs
  where fs.id = p_space_id;

  if not found then
    raise exception 'Financial Space not found.';
  end if;

  if v_deleted_at is not null then
    -- Idempotent: already tombstoned.
    return;
  end if;

  if v_owner_user_id <> auth.uid() then
    raise exception 'Unauthorized.';
  end if;

  if v_space_type = 'personal' then
    raise exception 'Personal Space cannot be deleted.';
  end if;

  /*
   * Protect outstanding cross-space obligations.
   *
   * Current observed statuses:
   * active
   * partially_reimbursed
   * completed
   * void
   */
  if exists (
    select 1
    from public.cross_space_events e
    where (
      e.managed_space_id = p_space_id
      or e.personal_space_id = p_space_id
    )
    and e.status::text in (
      'active',
      'partially_reimbursed'
    )
  ) then
    raise exception
      'Selesaikan Payable/Receivable yang masih aktif sebelum menghapus Managed Space.';
  end if;

  /*
   * Protect outstanding Debt / Receivable items.
   *
   * remaining_amount lives in debt_progress_view,
   * while space_id lives in debts.
   */
  if exists (
    select 1
    from public.debt_progress_view dp
    join public.debts d
      on d.id = dp.debt_id
    where d.space_id = p_space_id
      and dp.status::text in (
        'active',
        'partially_paid'
      )
      and dp.remaining_amount > 0
  ) then
    raise exception
      'Selesaikan Payable/Receivable yang masih aktif sebelum menghapus Managed Space.';
  end if;

  /*
   * Permanent product deletion = tombstone only.
   * Financial history remains intact.
   */
  update public.financial_spaces
  set
    deleted_at = now(),
    deleted_by = auth.uid(),
    is_archived = false,
    updated_at = now()
  where id = p_space_id;

  /*
   * Pending invitations are no longer usable after deletion.
   */
  update public.managed_space_invitations
  set
    status = 'cancelled',
    updated_at = now()
  where space_id = p_space_id
    and status = 'pending';
end;
$function$;