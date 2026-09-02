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
    return;
  end if;

  if v_owner_user_id <> auth.uid() then
    raise exception 'Unauthorized.';
  end if;

  if v_space_type = 'personal' then
    raise exception 'Personal Space cannot be deleted.';
  end if;

  /*
   * Authoritative outstanding-obligation check.
   *
   * Do NOT use cross_space_events.status here.
   * Historical/legacy events may retain status = active even when
   * their Payable/Receivable has already been fully settled.
   *
   * space_id lives on debts.
   * remaining_amount lives on debt_progress_view.
   */
  if exists (
    select 1
    from public.debts d
    join public.debt_progress_view dp
      on dp.debt_id = d.id
    where d.space_id = p_space_id
      and dp.status::text in ('active', 'partially_paid')
      and dp.remaining_amount > 0
  ) then
    raise exception
      'Selesaikan Payable/Receivable yang masih aktif sebelum menghapus Managed Space.';
  end if;

  /*
   * Tombstone only.
   * Preserve transactions, debts, settlements,
   * cross-space events and historical identity.
   */
  update public.financial_spaces
  set
    deleted_at = now(),
    deleted_by = auth.uid(),
    is_archived = false,
    updated_at = now()
  where id = p_space_id;

  /*
   * Pending invitations cannot remain usable.
   */
  update public.managed_space_invitations
  set
    status = 'cancelled',
    updated_at = now()
  where space_id = p_space_id
    and status = 'pending';
end;
$function$;