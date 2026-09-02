-- KASH: Managed Space onboarding creation and authoritative invitations.

create table if not exists public.managed_space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.financial_spaces(id) on delete cascade,
  invited_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_email text not null,
  role public.managed_space_role not null,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint managed_space_invitations_email_not_blank
    check (length(trim(invited_email)) > 0),
  constraint managed_space_invitations_role_not_owner
    check (role <> 'owner')
);

create unique index if not exists managed_space_invitations_pending_user_uidx
  on public.managed_space_invitations(space_id, invited_user_id)
  where status = 'pending';

create index if not exists managed_space_invitations_recipient_idx
  on public.managed_space_invitations(invited_user_id, status, invited_at desc);

create index if not exists managed_space_invitations_space_idx
  on public.managed_space_invitations(space_id, status, invited_at desc);

drop trigger if exists managed_space_invitations_set_updated_at
  on public.managed_space_invitations;
create trigger managed_space_invitations_set_updated_at
before update on public.managed_space_invitations
for each row execute function public.set_updated_at();

alter table public.managed_space_invitations enable row level security;

drop policy if exists "Recipients can view managed invitations"
  on public.managed_space_invitations;
create policy "Recipients can view managed invitations"
on public.managed_space_invitations for select
using (invited_user_id = auth.uid());

drop policy if exists "Managers can view managed invitations"
  on public.managed_space_invitations;
create policy "Managers can view managed invitations"
on public.managed_space_invitations for select
using (
  public.user_has_managed_space_role(
    space_id,
    array['owner', 'admin']::public.managed_space_role[]
  )
);

-- Preserve legacy invited rows as pending invitations, then remove them from
-- the membership table so invitation existence can never grant access.
insert into public.managed_space_invitations (
  space_id,
  invited_user_id,
  invited_email,
  role,
  invited_by,
  status,
  invited_at,
  created_at,
  updated_at
)
select
  m.space_id,
  m.user_id,
  lower(p.email),
  m.role,
  coalesce(m.invited_by, s.owner_user_id),
  'pending',
  m.created_at,
  m.created_at,
  m.updated_at
from public.managed_space_members m
join public.profiles p on p.id = m.user_id
join public.financial_spaces s on s.id = m.space_id
where m.status = 'invited'
  and m.role <> 'owner'
on conflict (space_id, invited_user_id) where status = 'pending' do nothing;

delete from public.managed_space_members where status = 'invited';

create or replace function public.create_managed_space(p_space_name text)
returns public.financial_spaces
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_space_name, ''));
  v_space public.financial_spaces;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if length(v_name) = 0 or length(v_name) > 50 then
    raise exception 'Managed Space name must contain 1 to 50 characters.';
  end if;

  insert into public.financial_spaces (owner_user_id, name, space_type, is_archived)
  values (auth.uid(), v_name, 'managed', false)
  returning * into v_space;

  return v_space;
end;
$$;

-- PostgreSQL cannot CREATE OR REPLACE a function when RETURNS TABLE OUT
-- parameters change. The live function has no hard dependencies, so replace
-- its signature explicitly without CASCADE.
drop function if exists public.get_managed_space_members(uuid);

create function public.get_managed_space_members(p_space_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  role public.managed_space_role,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.user_has_managed_space_access(p_space_id) then
    raise exception 'Unauthorized: active membership is required.';
  end if;

  return query
  select
    m.user_id,
    p.full_name,
    p.email,
    p.avatar_url,
    m.role,
    m.status,
    m.created_at
  from public.managed_space_members m
  join public.profiles p on p.id = m.user_id
  where m.space_id = p_space_id
    and m.status = 'active'
  order by
    case m.role when 'owner' then 0 when 'admin' then 1 when 'member' then 2 else 3 end,
    m.created_at;
end;
$$;

create or replace function public.get_managed_space_invitations(p_space_id uuid)
returns table (
  id uuid,
  space_id uuid,
  space_name text,
  invited_user_id uuid,
  invited_name text,
  invited_email text,
  invited_avatar_url text,
  role public.managed_space_role,
  status text,
  invited_by uuid,
  inviter_name text,
  inviter_email text,
  invited_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.user_has_managed_space_role(
    p_space_id,
    array['owner', 'admin']::public.managed_space_role[]
  ) then
    raise exception 'Unauthorized: membership management permission is required.';
  end if;

  return query
  select
    i.id,
    i.space_id,
    s.name,
    i.invited_user_id,
    recipient.full_name,
    i.invited_email,
    recipient.avatar_url,
    i.role,
    i.status,
    i.invited_by,
    inviter.full_name,
    inviter.email,
    i.invited_at,
    i.accepted_at,
    i.declined_at,
    i.cancelled_at
  from public.managed_space_invitations i
  join public.financial_spaces s on s.id = i.space_id
  join public.profiles recipient on recipient.id = i.invited_user_id
  join public.profiles inviter on inviter.id = i.invited_by
  where i.space_id = p_space_id
  order by i.invited_at desc;
end;
$$;

create or replace function public.invite_managed_space_member(
  p_space_id uuid,
  p_email text,
  p_role public.managed_space_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

create or replace function public.get_managed_space_invitation(p_invitation_id uuid)
returns table (
  id uuid,
  space_id uuid,
  space_name text,
  invited_user_id uuid,
  invited_name text,
  invited_email text,
  role public.managed_space_role,
  status text,
  invited_by uuid,
  inviter_name text,
  inviter_email text,
  inviter_avatar_url text,
  invited_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.managed_space_invitations;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_invitation
  from public.managed_space_invitations
  where managed_space_invitations.id = p_invitation_id;

  if not found or not (
    v_invitation.invited_user_id = auth.uid()
    or public.user_has_managed_space_role(
      v_invitation.space_id,
      array['owner', 'admin']::public.managed_space_role[]
    )
  ) then
    raise exception 'Invitation not found.';
  end if;

  return query
  select
    i.id,
    i.space_id,
    s.name,
    i.invited_user_id,
    recipient.full_name,
    i.invited_email,
    i.role,
    i.status,
    i.invited_by,
    inviter.full_name,
    inviter.email,
    inviter.avatar_url,
    i.invited_at,
    i.accepted_at,
    i.declined_at,
    i.cancelled_at
  from public.managed_space_invitations i
  join public.financial_spaces s on s.id = i.space_id
  join public.profiles recipient on recipient.id = i.invited_user_id
  join public.profiles inviter on inviter.id = i.invited_by
  where i.id = p_invitation_id;
end;
$$;

create or replace function public.respond_managed_space_invitation(
  p_invitation_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.managed_space_invitations;
  v_space public.financial_spaces;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_invitation
  from public.managed_space_invitations
  where id = p_invitation_id
  for update;

  if not found or v_invitation.invited_user_id <> auth.uid() then
    raise exception 'Invitation not found.';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending.';
  end if;

  select * into v_space
  from public.financial_spaces
  where id = v_invitation.space_id
    and space_type = 'managed'
    and not is_archived;

  if not found then
    raise exception 'Managed Space is unavailable.';
  end if;

  if p_action = 'accept' then
    insert into public.managed_space_members (
      space_id,
      user_id,
      role,
      status,
      invited_by
    ) values (
      v_invitation.space_id,
      auth.uid(),
      v_invitation.role,
      'active',
      v_invitation.invited_by
    )
    on conflict (space_id, user_id) do update
    set
      role = excluded.role,
      status = 'active',
      invited_by = excluded.invited_by,
      updated_at = now();

    update public.managed_space_invitations
    set status = 'accepted', accepted_at = now()
    where id = p_invitation_id;
  elsif p_action = 'decline' then
    update public.managed_space_invitations
    set status = 'declined', declined_at = now()
    where id = p_invitation_id;
  else
    raise exception 'Invalid invitation action.';
  end if;

  update public.notifications
  set is_read = true, read_at = now()
  where user_id = auth.uid()
    and entity_type = 'managed_space_invitation'
    and entity_id = p_invitation_id;

  return jsonb_build_object(
    'success', true,
    'status', case when p_action = 'accept' then 'accepted' else 'declined' end,
    'space_id', v_space.id,
    'space_name', v_space.name,
    'role', v_invitation.role::text
  );
end;
$$;

create or replace function public.cancel_managed_space_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.managed_space_invitations;
  v_caller_role public.managed_space_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_invitation
  from public.managed_space_invitations
  where id = p_invitation_id
  for update;

  if not found or v_invitation.status <> 'pending' then
    raise exception 'Pending invitation not found.';
  end if;

  select role into v_caller_role
  from public.managed_space_members
  where space_id = v_invitation.space_id
    and user_id = auth.uid()
    and status = 'active';

  if v_caller_role is null
    or v_caller_role not in ('owner', 'admin')
    or (v_caller_role = 'admin' and v_invitation.role = 'admin') then
    raise exception 'Unauthorized.';
  end if;

  update public.managed_space_invitations
  set status = 'cancelled', cancelled_at = now()
  where id = p_invitation_id;

  update public.notifications
  set is_read = true, read_at = now()
  where user_id = v_invitation.invited_user_id
    and entity_type = 'managed_space_invitation'
    and entity_id = p_invitation_id;
end;
$$;

-- Retain the old function name as an invitation-compatible wrapper for any
-- existing client still using it. It no longer activates members directly.
create or replace function public.add_managed_space_member(
  p_space_id uuid,
  p_email text,
  p_role public.managed_space_role
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.invite_managed_space_member(p_space_id, p_email, p_role);
$$;

grant execute on function public.create_managed_space(text) to authenticated;
grant execute on function public.get_managed_space_members(uuid) to authenticated;
grant execute on function public.get_managed_space_invitations(uuid) to authenticated;
grant execute on function public.invite_managed_space_member(uuid, text, public.managed_space_role) to authenticated;
grant execute on function public.get_managed_space_invitation(uuid) to authenticated;
grant execute on function public.respond_managed_space_invitation(uuid, text) to authenticated;
grant execute on function public.cancel_managed_space_invitation(uuid) to authenticated;
grant execute on function public.add_managed_space_member(uuid, text, public.managed_space_role) to authenticated;

revoke all on function public.create_managed_space(text) from public, anon;
revoke all on function public.get_managed_space_members(uuid) from public, anon;
revoke all on function public.get_managed_space_invitations(uuid) from public, anon;
revoke all on function public.invite_managed_space_member(uuid, text, public.managed_space_role) from public, anon;
revoke all on function public.get_managed_space_invitation(uuid) from public, anon;
revoke all on function public.respond_managed_space_invitation(uuid, text) from public, anon;
revoke all on function public.cancel_managed_space_invitation(uuid) from public, anon;
revoke all on function public.add_managed_space_member(uuid, text, public.managed_space_role) from public, anon;
