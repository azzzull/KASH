-- KASH Managed Spaces final stabilization.
-- Keep this as a follow-up migration because 202609020008 is not present
-- locally and earlier migrations may already be applied in some environments.

create or replace function public.user_can_view_financial_space(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.financial_spaces s
    where s.id = p_space_id
      and s.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.financial_spaces s
    join public.managed_space_members m on m.space_id = s.id
    where s.id = p_space_id
      and s.space_type = 'managed'
      and s.deleted_at is null
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
  or exists (
    select 1
    from public.counterparties c
    where c.user_id = auth.uid()
      and c.linked_space_id = p_space_id
  )
  or exists (
    select 1
    from public.cross_space_events e
    join public.financial_spaces personal on personal.id = e.personal_space_id
    where e.managed_space_id = p_space_id
      and personal.owner_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.cross_space_events e
    join public.managed_space_members m on m.space_id = e.managed_space_id
    where e.personal_space_id = p_space_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

revoke execute on function public.user_can_view_financial_space(uuid) from public, anon;
grant execute on function public.user_can_view_financial_space(uuid) to authenticated;

drop policy if exists "Users can view financial spaces" on public.financial_spaces;
drop policy if exists "Users can view their own financial spaces" on public.financial_spaces;

create policy "Users can view financial spaces" on public.financial_spaces
for select
using (public.user_can_view_financial_space(id));

create or replace function public.invite_managed_space_member(
  p_space_id uuid,
  p_email text,
  p_role public.managed_space_role
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller_role public.managed_space_role;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_target public.profiles;
  v_space public.financial_spaces;
  v_inviter public.profiles;
  v_existing_id uuid;
  v_invitation_id uuid;
  v_role_label text;
  v_is_english boolean;
  v_title text;
  v_message text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select m.role into v_caller_role
  from public.managed_space_members m
  where m.space_id = p_space_id
    and m.user_id = auth.uid()
    and m.status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'Unauthorized.';
  end if;

  if p_role = 'owner' or (v_caller_role = 'admin' and p_role = 'admin') then
    raise exception 'The selected role cannot be invited by your current role.';
  end if;

  if length(v_email) = 0 or v_email not like '%@%.%' then
    raise exception 'Unable to send this invitation.';
  end if;

  select * into v_space
  from public.financial_spaces
  where id = p_space_id
    and space_type = 'managed'
    and deleted_at is null
    and not is_archived;

  if not found then
    raise exception 'Managed Space is unavailable.';
  end if;

  select * into v_target
  from public.profiles
  where lower(email) = v_email;

  if not found or v_target.id = auth.uid() then
    raise exception 'Unable to send this invitation.';
  end if;

  if exists (
    select 1 from public.managed_space_members
    where space_id = p_space_id
      and user_id = v_target.id
      and status = 'active'
  ) then
    raise exception 'Unable to send this invitation.';
  end if;

  select id into v_existing_id
  from public.managed_space_invitations
  where space_id = p_space_id
    and invited_user_id = v_target.id
    and status = 'pending'
  for update;

  if v_existing_id is not null then
    return jsonb_build_object(
      'success', true,
      'invitation_id', v_existing_id,
      'duplicate', true
    );
  end if;

  insert into public.managed_space_invitations (
    space_id,
    invited_user_id,
    invited_email,
    role,
    invited_by,
    status
  ) values (
    p_space_id,
    v_target.id,
    v_email,
    p_role,
    auth.uid(),
    'pending'
  )
  returning id into v_invitation_id;

  select * into v_inviter from public.profiles where id = auth.uid();
  v_is_english := lower(coalesce(v_target.locale, 'id')) like 'en%';
  v_role_label := initcap(p_role::text);

  if v_is_english then
    v_title := 'Managed Space Invitation';
    v_message := coalesce(v_inviter.full_name, v_inviter.email)
      || ' invited you to join ' || v_space.name || ' as ' || v_role_label || '.';
  else
    v_title := 'Undangan Managed Space';
    v_message := coalesce(v_inviter.full_name, v_inviter.email)
      || ' mengundang kamu bergabung ke ' || v_space.name || ' sebagai ' || v_role_label || '.';
  end if;

  begin
    insert into public.notifications (
      user_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_target.id,
      'managed_space_invitation',
      v_title,
      v_message,
      'managed_space_invitation',
      v_invitation_id,
      jsonb_build_object(
        'space_id', v_space.id,
        'space_name', v_space.name,
        'inviter_name', coalesce(v_inviter.full_name, v_inviter.email),
        'inviter_email', v_inviter.email,
        'role', p_role::text,
        'target_path', '/managed-invitations/' || v_invitation_id::text,
        'push_title', case when v_is_english
          then 'KASH - Managed Space Invitation'
          else 'KASH - Undangan Managed Space' end,
        'push_message', case when v_is_english
          then coalesce(v_inviter.full_name, v_inviter.email) || ' invited you to join ' || v_space.name || '.'
          else coalesce(v_inviter.full_name, v_inviter.email) || ' mengundang kamu bergabung ke ' || v_space.name || '.' end
      )
    );
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'success', true,
    'invitation_id', v_invitation_id,
    'duplicate', false
  );
exception
  when unique_violation then
    select id into v_existing_id
    from public.managed_space_invitations
    where space_id = p_space_id
      and invited_user_id = v_target.id
      and status = 'pending';

    if v_existing_id is not null then
      return jsonb_build_object(
        'success', true,
        'invitation_id', v_existing_id,
        'duplicate', true
      );
    end if;
    raise;
end;
$$;

revoke all on function public.invite_managed_space_member(uuid, text, public.managed_space_role) from public, anon;
grant execute on function public.invite_managed_space_member(uuid, text, public.managed_space_role) to authenticated;
