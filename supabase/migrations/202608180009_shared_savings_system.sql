-- KASH Beta Sprint 16: Shared Savings (Tabungan Bersama) Architecture
-- Creates shared_savings, shared_savings_members, shared_savings_approvers,
-- shared_savings_invites, shared_savings_requests, shared_savings_ledger,
-- shared_savings_member_allocations, shared_savings_notification_logs,
-- views, RLS policies, and authoritative atomic security definer RPCs.

-- ============================================================
-- 1. TABLES
-- ============================================================

-- 1.1 Shared Savings Main Table
create table if not exists public.shared_savings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  target_amount numeric(18,2) null,
  deadline date null,
  account_holder_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'active',
  icon text not null default 'users',
  color text not null default '#10B981',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz null,
  constraint shared_savings_name_not_blank check (length(trim(name)) > 0),
  constraint shared_savings_target_positive check (target_amount is null or target_amount > 0),
  constraint shared_savings_status_valid check (status in ('active', 'closed', 'archived'))
);

create index if not exists shared_savings_owner_idx on public.shared_savings(owner_user_id);
create index if not exists shared_savings_account_holder_idx on public.shared_savings(account_holder_user_id);
create index if not exists shared_savings_status_idx on public.shared_savings(status);

-- 1.2 Members Table (Historical & Active)
create table if not exists public.shared_savings_members (
  id uuid primary key default gen_random_uuid(),
  shared_savings_id uuid not null references public.shared_savings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_savings_members_status_valid check (status in ('active', 'left', 'removed'))
);

create index if not exists shared_savings_members_space_idx on public.shared_savings_members(shared_savings_id, status);
create index if not exists shared_savings_members_user_idx on public.shared_savings_members(user_id, status);

create unique index if not exists shared_savings_active_member_uidx
on public.shared_savings_members (shared_savings_id, user_id)
where (status = 'active');

-- 1.3 Approvers Table
create table if not exists public.shared_savings_approvers (
  id uuid primary key default gen_random_uuid(),
  shared_savings_id uuid not null references public.shared_savings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint shared_savings_approvers_unique unique (shared_savings_id, user_id)
);

create index if not exists shared_savings_approvers_space_idx on public.shared_savings_approvers(shared_savings_id);
create index if not exists shared_savings_approvers_user_idx on public.shared_savings_approvers(user_id);

-- 1.4 Invites Table
create table if not exists public.shared_savings_invites (
  id uuid primary key default gen_random_uuid(),
  shared_savings_id uuid not null references public.shared_savings(id) on delete cascade,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  invited_user_id uuid references public.profiles(id) on delete cascade,
  invited_email text not null,
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz null,
  responded_at timestamptz null,
  constraint shared_savings_invites_email_not_blank check (length(trim(invited_email)) > 0),
  constraint shared_savings_invites_status_valid check (status in ('pending', 'accepted', 'rejected', 'expired', 'cancelled'))
);

create index if not exists shared_savings_invites_space_idx on public.shared_savings_invites(shared_savings_id, status);
create index if not exists shared_savings_invites_user_idx on public.shared_savings_invites(invited_user_id, status);
create index if not exists shared_savings_invites_email_idx on public.shared_savings_invites(lower(invited_email), status);

-- 1.5 Requests Table
create table if not exists public.shared_savings_requests (
  id uuid primary key default gen_random_uuid(),
  shared_savings_id uuid not null references public.shared_savings(id) on delete cascade,
  request_type text not null,
  requested_by_user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(18,2) not null,
  source_wallet_id uuid references public.wallets(id) on delete set null,
  destination_wallet_id uuid references public.wallets(id) on delete set null,
  title text,
  note text,
  status text not null default 'pending',
  approved_by_user_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz null,
  rejected_by_user_id uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz null,
  rejection_reason text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_savings_requests_amount_positive check (amount > 0),
  constraint shared_savings_requests_type_valid check (request_type in ('contribution', 'withdrawal', 'shared_spending')),
  constraint shared_savings_requests_status_valid check (status in ('pending', 'approved', 'rejected', 'cancelled'))
);

create index if not exists shared_savings_requests_space_status_idx on public.shared_savings_requests(shared_savings_id, status, created_at desc);
create index if not exists shared_savings_requests_user_idx on public.shared_savings_requests(requested_by_user_id);
create index if not exists shared_savings_requests_transaction_idx on public.shared_savings_requests(transaction_id);

-- 1.6 Shared Savings Ledger (Event Log)
create table if not exists public.shared_savings_ledger (
  id uuid primary key default gen_random_uuid(),
  shared_savings_id uuid not null references public.shared_savings(id) on delete cascade,
  request_id uuid not null references public.shared_savings_requests(id) on delete cascade,
  event_type text not null,
  amount numeric(18,2) not null,
  title text,
  note text,
  created_at timestamptz not null default now(),
  constraint shared_savings_ledger_amount_positive check (amount > 0),
  constraint shared_savings_ledger_type_valid check (event_type in ('contribution', 'personal_withdrawal', 'shared_spending', 'reversal'))
);

create index if not exists shared_savings_ledger_space_idx on public.shared_savings_ledger(shared_savings_id, created_at desc);
create index if not exists shared_savings_ledger_request_idx on public.shared_savings_ledger(request_id);

-- 1.7 Member Allocations (Authoritative Economic Shares)
create table if not exists public.shared_savings_member_allocations (
  id uuid primary key default gen_random_uuid(),
  shared_savings_id uuid not null references public.shared_savings(id) on delete cascade,
  ledger_id uuid not null references public.shared_savings_ledger(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_signed numeric(18,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists shared_savings_allocations_space_user_idx on public.shared_savings_member_allocations(shared_savings_id, user_id);
create index if not exists shared_savings_allocations_ledger_idx on public.shared_savings_member_allocations(ledger_id);
create index if not exists shared_savings_allocations_user_idx on public.shared_savings_member_allocations(user_id);

-- 1.8 Versioned Notification Logs
create table if not exists public.shared_savings_notification_logs (
  id uuid primary key default gen_random_uuid(),
  shared_savings_id uuid not null references public.shared_savings(id) on delete cascade,
  event_type text not null,
  reference_value text not null,
  created_at timestamptz not null default now(),
  constraint shared_savings_notif_log_unique unique (shared_savings_id, event_type, reference_value)
);

create index if not exists shared_savings_notif_logs_space_idx on public.shared_savings_notification_logs(shared_savings_id, event_type);

-- Triggers for updated_at
create trigger shared_savings_set_updated_at
before update on public.shared_savings
for each row execute function public.set_updated_at();

create trigger shared_savings_members_set_updated_at
before update on public.shared_savings_members
for each row execute function public.set_updated_at();

create trigger shared_savings_requests_set_updated_at
before update on public.shared_savings_requests
for each row execute function public.set_updated_at();


-- ============================================================
-- 2. VIEWS
-- ============================================================

-- 2.1 Shared Savings Balance View (Ledger-Derived)
create or replace view public.shared_savings_balance_view
with (security_invoker = true) as
select
  s.id as shared_savings_id,
  s.owner_user_id,
  s.name,
  s.target_amount,
  s.deadline,
  s.account_holder_user_id,
  s.status,
  s.icon,
  s.color,
  s.created_at,
  coalesce(sum(
    case
      when l.event_type = 'contribution' then l.amount
      when l.event_type = 'personal_withdrawal' then -l.amount
      when l.event_type = 'shared_spending' then -l.amount
      when l.event_type = 'reversal' then l.amount
      else 0
    end
  ), 0)::numeric(18,2) as current_balance,
  coalesce(sum(case when l.event_type = 'contribution' then l.amount else 0 end), 0)::numeric(18,2) as total_contributions,
  coalesce(sum(case when l.event_type = 'personal_withdrawal' then l.amount else 0 end), 0)::numeric(18,2) as total_withdrawals,
  coalesce(sum(case when l.event_type = 'shared_spending' then l.amount else 0 end), 0)::numeric(18,2) as total_spending,
  (
    select count(*)
    from public.shared_savings_members m
    where m.shared_savings_id = s.id
      and m.status = 'active'
  )::integer as active_members_count
from public.shared_savings s
left join public.shared_savings_ledger l on l.shared_savings_id = s.id
group by s.id;

grant select on public.shared_savings_balance_view to authenticated;

-- 2.2 Member Shares View (Allocation-Derived)
create or replace view public.shared_savings_member_shares_view
with (security_invoker = true) as
select
  m.shared_savings_id,
  m.user_id,
  m.status as member_status,
  m.joined_at,
  m.left_at,
  p.full_name as member_name,
  p.email as member_email,
  p.avatar_url as member_avatar_url,
  coalesce(sum(a.amount_signed), 0)::numeric(18,2) as current_share,
  coalesce(sum(case when a.amount_signed > 0 then a.amount_signed else 0 end), 0)::numeric(18,2) as total_contributed,
  coalesce(sum(
    case
      when a.amount_signed < 0 and l.event_type = 'personal_withdrawal' then -a.amount_signed
      else 0
    end
  ), 0)::numeric(18,2) as total_withdrawn,
  coalesce(sum(
    case
      when a.amount_signed < 0 and l.event_type = 'shared_spending' then -a.amount_signed
      else 0
    end
  ), 0)::numeric(18,2) as total_spent_allocated
from public.shared_savings_members m
join public.profiles p on p.id = m.user_id
left join public.shared_savings_member_allocations a
  on a.shared_savings_id = m.shared_savings_id
 and a.user_id = m.user_id
left join public.shared_savings_ledger l
  on l.id = a.ledger_id
group by m.shared_savings_id, m.user_id, m.status, m.joined_at, m.left_at, p.full_name, p.email, p.avatar_url;

grant select on public.shared_savings_member_shares_view to authenticated;


-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table public.shared_savings enable row level security;
alter table public.shared_savings_members enable row level security;
alter table public.shared_savings_approvers enable row level security;
alter table public.shared_savings_invites enable row level security;
alter table public.shared_savings_requests enable row level security;
alter table public.shared_savings_ledger enable row level security;
alter table public.shared_savings_member_allocations enable row level security;
alter table public.shared_savings_notification_logs enable row level security;

-- Helper functions for non-recursive RLS evaluation
create or replace function public.is_shared_savings_member(p_shared_savings_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.shared_savings_members m
    where m.shared_savings_id = p_shared_savings_id
      and m.user_id = p_user_id
  );
$$;

create or replace function public.is_shared_savings_owner(p_shared_savings_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.shared_savings s
    where s.id = p_shared_savings_id
      and s.owner_user_id = p_user_id
  );
$$;

grant execute on function public.is_shared_savings_member(uuid, uuid) to authenticated, anon;
grant execute on function public.is_shared_savings_owner(uuid, uuid) to authenticated, anon;

-- 3.1 shared_savings
create policy "Users can view shared savings they belong to or created"
on public.shared_savings for select
using (
  owner_user_id = auth.uid()
  or public.is_shared_savings_member(id, auth.uid())
  or exists (
    select 1 from public.shared_savings_invites i
    where i.shared_savings_id = public.shared_savings.id
      and (i.invited_user_id = auth.uid() or lower(i.invited_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
);

create policy "Owner can update shared savings"
on public.shared_savings for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

-- 3.2 shared_savings_members
create policy "Users can view members of their shared savings spaces"
on public.shared_savings_members for select
using (
  user_id = auth.uid()
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 3.3 shared_savings_approvers
create policy "Users can view approvers of their shared savings spaces"
on public.shared_savings_approvers for select
using (
  user_id = auth.uid()
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 3.4 shared_savings_invites
create policy "Users can view invites for their spaces or sent to them"
on public.shared_savings_invites for select
using (
  inviter_user_id = auth.uid()
  or invited_user_id = auth.uid()
  or lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 3.5 shared_savings_requests
create policy "Users can view requests in spaces they belong to"
on public.shared_savings_requests for select
using (
  requested_by_user_id = auth.uid()
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 3.6 shared_savings_ledger & member_allocations
create policy "Users can view ledger in spaces they belong to"
on public.shared_savings_ledger for select
using (
  public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

create policy "Users can view allocations in spaces they belong to"
on public.shared_savings_member_allocations for select
using (
  user_id = auth.uid()
  or public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);

-- 3.7 notification logs
create policy "Users can view notification logs for their spaces"
on public.shared_savings_notification_logs for select
using (
  public.is_shared_savings_owner(shared_savings_id, auth.uid())
  or public.is_shared_savings_member(shared_savings_id, auth.uid())
);


-- ============================================================
-- 4. AUTHORITATIVE POSTGRESQL RPCs (SECURITY DEFINER)
-- ============================================================

-- 4.1 Create Shared Savings (Bootstrap Owner, Member, Account Holder, Approver)
create or replace function public.create_shared_savings(
  p_name text,
  p_target_amount numeric default null,
  p_deadline date default null,
  p_icon text default 'users',
  p_color text default '#10B981'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_space_id uuid;
  v_clean_name text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  v_clean_name := trim(coalesce(p_name, ''));
  if length(v_clean_name) = 0 then
    raise exception 'Shared savings name cannot be empty.';
  end if;

  if p_target_amount is not null and p_target_amount <= 0 then
    raise exception 'Target amount must be greater than zero.';
  end if;

  v_space_id := gen_random_uuid();

  -- Insert Shared Savings Space with creator as initial Owner and Account Holder
  insert into public.shared_savings (
    id,
    owner_user_id,
    name,
    target_amount,
    deadline,
    account_holder_user_id,
    status,
    icon,
    color
  ) values (
    v_space_id,
    v_user_id,
    v_clean_name,
    p_target_amount,
    p_deadline,
    v_user_id,
    'active',
    coalesce(p_icon, 'users'),
    coalesce(p_color, '#10B981')
  );

  -- Bootstrap creator as active Member
  insert into public.shared_savings_members (
    shared_savings_id,
    user_id,
    status,
    joined_at
  ) values (
    v_space_id,
    v_user_id,
    'active',
    now()
  );

  -- Bootstrap creator as initial Approver
  insert into public.shared_savings_approvers (
    shared_savings_id,
    user_id
  ) values (
    v_space_id,
    v_user_id
  );

  return v_space_id;
end;
$$;

grant execute on function public.create_shared_savings(text, numeric, date, text, text) to authenticated;


-- 4.2 Invite Member
create or replace function public.invite_shared_savings_member(
  p_shared_savings_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_space public.shared_savings;
  v_clean_email text;
  v_invited_user_id uuid;
  v_invite_id uuid;
  v_inviter_name text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null then
    raise exception 'Shared savings space not found.';
  end if;

  if v_space.owner_user_id <> v_caller_id then
    raise exception 'Only the Owner can invite new members.';
  end if;

  if v_space.status <> 'active' then
    raise exception 'Cannot invite members to an inactive space.';
  end if;

  v_clean_email := lower(trim(coalesce(p_email, '')));
  if length(v_clean_email) = 0 or v_clean_email not like '%@%.%' then
    raise exception 'Please provide a valid email address.';
  end if;

  -- Look up matching profile safely
  select id into v_invited_user_id
  from public.profiles
  where lower(email) = v_clean_email;

  -- Check if already an active member
  if v_invited_user_id is not null then
    if exists (
      select 1 from public.shared_savings_members
      where shared_savings_id = p_shared_savings_id
        and user_id = v_invited_user_id
        and status = 'active'
    ) then
      raise exception 'User is already an active member of this shared savings.';
    end if;
  end if;

  -- Check for existing pending invite
  if exists (
    select 1 from public.shared_savings_invites
    where shared_savings_id = p_shared_savings_id
      and lower(invited_email) = v_clean_email
      and status = 'pending'
      and expires_at > now()
  ) then
    raise exception 'An active invitation has already been sent to this email.';
  end if;

  v_invite_id := gen_random_uuid();

  insert into public.shared_savings_invites (
    id,
    shared_savings_id,
    inviter_user_id,
    invited_user_id,
    invited_email,
    status,
    expires_at
  ) values (
    v_invite_id,
    p_shared_savings_id,
    v_caller_id,
    v_invited_user_id,
    v_clean_email,
    'pending',
    now() + interval '7 days'
  );

  -- If invited user already has an account, send notification
  if v_invited_user_id is not null then
    select coalesce(full_name, email) into v_inviter_name
    from public.profiles
    where id = v_caller_id;

    insert into public.notifications (
      user_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_invited_user_id,
      'shared_invitation',
      'Undangan Tabungan Bersama',
      v_inviter_name || ' mengundang Anda bergabung ke "' || v_space.name || '".',
      'shared_savings_invite',
      v_invite_id,
      jsonb_build_object(
        'shared_savings_id', v_space.id,
        'shared_savings_name', v_space.name,
        'inviter_name', v_inviter_name,
        'target_path', '/shared-savings'
      )
    );
  end if;

  return v_invite_id;
end;
$$;

grant execute on function public.invite_shared_savings_member(uuid, text) to authenticated;


-- 4.3 Respond to Invite (Accept / Reject)
create or replace function public.respond_shared_savings_invite(
  p_invite_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_email text;
  v_invite public.shared_savings_invites;
  v_space public.shared_savings;
  v_user_name text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select email, coalesce(full_name, email) into v_user_email, v_user_name
  from public.profiles
  where id = v_user_id;

  select * into v_invite
  from public.shared_savings_invites
  where id = p_invite_id;

  if v_invite.id is null then
    raise exception 'Invitation not found.';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invitation is no longer pending (current status: %).', v_invite.status;
  end if;

  if v_invite.expires_at < now() then
    update public.shared_savings_invites
    set status = 'expired'
    where id = p_invite_id;
    raise exception 'Invitation has expired.';
  end if;

  -- Verify recipient identity
  if v_invite.invited_user_id is not null and v_invite.invited_user_id <> v_user_id then
    raise exception 'This invitation was addressed to another user account.';
  end if;

  if v_invite.invited_user_id is null and lower(v_user_email) <> lower(v_invite.invited_email) then
    raise exception 'This invitation email does not match your account email.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = v_invite.shared_savings_id;

  if v_space.status <> 'active' then
    raise exception 'This shared savings space is no longer active.';
  end if;

  if p_action = 'accept' then
    -- Insert or reactivate membership
    insert into public.shared_savings_members (
      shared_savings_id,
      user_id,
      status,
      joined_at,
      left_at
    ) values (
      v_space.id,
      v_user_id,
      'active',
      now(),
      null
    )
    on conflict (shared_savings_id, user_id) where (status = 'active') do nothing;

    update public.shared_savings_invites
    set
      status = 'accepted',
      invited_user_id = v_user_id,
      accepted_at = now(),
      responded_at = now()
    where id = p_invite_id;

    -- Notify space owner
    insert into public.notifications (
      user_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_space.owner_user_id,
      'shared_invitation',
      'Anggota Baru Bergabung',
      v_user_name || ' telah menerima undangan dan bergabung ke "' || v_space.name || '".',
      'shared_savings',
      v_space.id,
      jsonb_build_object(
        'shared_savings_id', v_space.id,
        'member_user_id', v_user_id,
        'target_path', '/shared-savings/' || v_space.id::text
      )
    );

    return true;

  elsif p_action = 'reject' then
    update public.shared_savings_invites
    set
      status = 'rejected',
      invited_user_id = v_user_id,
      responded_at = now()
    where id = p_invite_id;

    return true;

  else
    raise exception 'Invalid invite action. Use "accept" or "reject".';
  end if;
end;
$$;

grant execute on function public.respond_shared_savings_invite(uuid, text) to authenticated;


-- 4.4 Submit Contribution Request
create or replace function public.submit_shared_contribution_request(
  p_shared_savings_id uuid,
  p_source_wallet_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_space public.shared_savings;
  v_wallet public.wallets;
  v_request_id uuid;
  v_user_name text;
  v_approver record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Contribution amount must be greater than zero.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null or v_space.status <> 'active' then
    raise exception 'Shared savings space not found or is inactive.';
  end if;

  -- Verify active membership
  if not exists (
    select 1 from public.shared_savings_members
    where shared_savings_id = p_shared_savings_id
      and user_id = v_user_id
      and status = 'active'
  ) then
    raise exception 'You must be an active member of this space to contribute.';
  end if;

  -- Verify source wallet ownership
  select * into v_wallet
  from public.wallets
  where id = p_source_wallet_id
    and user_id = v_user_id
    and is_archived = false;

  if v_wallet.id is null then
    raise exception 'Source wallet not found or does not belong to you.';
  end if;

  v_request_id := gen_random_uuid();

  insert into public.shared_savings_requests (
    id,
    shared_savings_id,
    request_type,
    requested_by_user_id,
    amount,
    source_wallet_id,
    destination_wallet_id,
    note,
    status
  ) values (
    v_request_id,
    p_shared_savings_id,
    'contribution',
    v_user_id,
    p_amount,
    p_source_wallet_id,
    null,
    p_note,
    'pending'
  );

  -- Notify approvers
  select coalesce(full_name, email) into v_user_name
  from public.profiles
  where id = v_user_id;

  for v_approver in (
    select a.user_id
    from public.shared_savings_approvers a
    join public.shared_savings_members m
      on m.shared_savings_id = a.shared_savings_id
     and m.user_id = a.user_id
    where a.shared_savings_id = p_shared_savings_id
      and m.status = 'active'
  ) loop
    insert into public.notifications (
      user_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_approver.user_id,
      'shared_contribution_pending',
      'Permintaan Setoran Masuk',
      v_user_name || ' mengajukan setoran Rp' || to_char(p_amount, 'FM999,999,999,999') || ' ke "' || v_space.name || '".',
      'shared_savings',
      p_shared_savings_id,
      jsonb_build_object(
        'shared_savings_id', p_shared_savings_id,
        'request_id', v_request_id,
        'target_path', '/shared-savings/' || p_shared_savings_id::text
      )
    );
  end loop;

  return v_request_id;
end;
$$;

grant execute on function public.submit_shared_contribution_request(uuid, uuid, numeric, text) to authenticated;


-- 4.5 Submit Withdrawal Request
create or replace function public.submit_shared_withdrawal_request(
  p_shared_savings_id uuid,
  p_destination_wallet_id uuid,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_space public.shared_savings;
  v_wallet public.wallets;
  v_current_share numeric;
  v_request_id uuid;
  v_user_name text;
  v_approver record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Withdrawal amount must be greater than zero.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null or v_space.status <> 'active' then
    raise exception 'Shared savings space not found or is inactive.';
  end if;

  -- Verify active membership
  if not exists (
    select 1 from public.shared_savings_members
    where shared_savings_id = p_shared_savings_id
      and user_id = v_user_id
      and status = 'active'
  ) then
    raise exception 'You must be an active member of this space.';
  end if;

  -- Verify user's available economic share
  select coalesce(sum(amount_signed), 0) into v_current_share
  from public.shared_savings_member_allocations
  where shared_savings_id = p_shared_savings_id
    and user_id = v_user_id;

  if p_amount > v_current_share then
    raise exception 'Penarikan melebihi porsi tabungan Anda (Porsi tersedia: Rp%).', to_char(v_current_share, 'FM999,999,999,999');
  end if;

  -- Verify destination wallet ownership
  select * into v_wallet
  from public.wallets
  where id = p_destination_wallet_id
    and user_id = v_user_id
    and is_archived = false;

  if v_wallet.id is null then
    raise exception 'Destination wallet not found or does not belong to you.';
  end if;

  v_request_id := gen_random_uuid();

  insert into public.shared_savings_requests (
    id,
    shared_savings_id,
    request_type,
    requested_by_user_id,
    amount,
    source_wallet_id,
    destination_wallet_id,
    note,
    status
  ) values (
    v_request_id,
    p_shared_savings_id,
    'withdrawal',
    v_user_id,
    p_amount,
    null,
    p_destination_wallet_id,
    p_note,
    'pending'
  );

  -- Notify approvers
  select coalesce(full_name, email) into v_user_name
  from public.profiles
  where id = v_user_id;

  for v_approver in (
    select a.user_id
    from public.shared_savings_approvers a
    join public.shared_savings_members m
      on m.shared_savings_id = a.shared_savings_id
     and m.user_id = a.user_id
    where a.shared_savings_id = p_shared_savings_id
      and m.status = 'active'
  ) loop
    insert into public.notifications (
      user_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_approver.user_id,
      'shared_contribution_pending',
      'Permintaan Penarikan Porsi',
      v_user_name || ' meminta penarikan porsi Rp' || to_char(p_amount, 'FM999,999,999,999') || ' dari "' || v_space.name || '".',
      'shared_savings',
      p_shared_savings_id,
      jsonb_build_object(
        'shared_savings_id', p_shared_savings_id,
        'request_id', v_request_id,
        'target_path', '/shared-savings/' || p_shared_savings_id::text
      )
    );
  end loop;

  return v_request_id;
end;
$$;

grant execute on function public.submit_shared_withdrawal_request(uuid, uuid, numeric, text) to authenticated;


-- 4.6 Submit Shared Spending Request
create or replace function public.submit_shared_spending_request(
  p_shared_savings_id uuid,
  p_title text,
  p_amount numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_space public.shared_savings;
  v_clean_title text;
  v_active_count integer;
  v_request_id uuid;
  v_user_name text;
  v_approver record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.';
  end if;

  v_clean_title := trim(coalesce(p_title, ''));
  if length(v_clean_title) = 0 then
    raise exception 'Judul pengeluaran bersama tidak boleh kosong.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal pengeluaran bersama harus lebih dari 0.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null or v_space.status <> 'active' then
    raise exception 'Shared savings space not found or is inactive.';
  end if;

  -- Verify active membership
  if not exists (
    select 1 from public.shared_savings_members
    where shared_savings_id = p_shared_savings_id
      and user_id = v_user_id
      and status = 'active'
  ) then
    raise exception 'You must be an active member of this space.';
  end if;

  select count(*) into v_active_count
  from public.shared_savings_members
  where shared_savings_id = p_shared_savings_id
    and status = 'active';

  if v_active_count = 0 then
    raise exception 'No active members in this space.';
  end if;

  v_request_id := gen_random_uuid();

  insert into public.shared_savings_requests (
    id,
    shared_savings_id,
    request_type,
    requested_by_user_id,
    amount,
    title,
    note,
    status
  ) values (
    v_request_id,
    p_shared_savings_id,
    'shared_spending',
    v_user_id,
    p_amount,
    v_clean_title,
    p_note,
    'pending'
  );

  -- Notify approvers
  select coalesce(full_name, email) into v_user_name
  from public.profiles
  where id = v_user_id;

  for v_approver in (
    select a.user_id
    from public.shared_savings_approvers a
    join public.shared_savings_members m
      on m.shared_savings_id = a.shared_savings_id
     and m.user_id = a.user_id
    where a.shared_savings_id = p_shared_savings_id
      and m.status = 'active'
  ) loop
    insert into public.notifications (
      user_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_approver.user_id,
      'shared_contribution_pending',
      'Pengajuan Pengeluaran Bersama',
      v_user_name || ' mengajukan "' || v_clean_title || '" (Rp' || to_char(p_amount, 'FM999,999,999,999') || ') untuk "' || v_space.name || '".',
      'shared_savings',
      p_shared_savings_id,
      jsonb_build_object(
        'shared_savings_id', p_shared_savings_id,
        'request_id', v_request_id,
        'target_path', '/shared-savings/' || p_shared_savings_id::text
      )
    );
  end loop;

  return v_request_id;
end;
$$;

grant execute on function public.submit_shared_spending_request(uuid, text, numeric, text) to authenticated;


-- Helper: Check Approver Authorization & Conditional Self-Approval
create or replace function public.check_shared_approver_permission(
  p_shared_savings_id uuid,
  p_requester_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_other_approvers_count integer;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  -- Caller must be an active approver
  if not exists (
    select 1
    from public.shared_savings_approvers a
    join public.shared_savings_members m
      on m.shared_savings_id = a.shared_savings_id
     and m.user_id = a.user_id
    where a.shared_savings_id = p_shared_savings_id
      and a.user_id = v_caller_id
      and m.status = 'active'
  ) then
    raise exception 'You are not authorized as an active Approver for this space.';
  end if;

  -- Self-approval deadlock rule:
  -- If requester is the caller, count OTHER eligible active approvers.
  if v_caller_id = p_requester_user_id then
    select count(*) into v_other_approvers_count
    from public.shared_savings_approvers a
    join public.shared_savings_members m
      on m.shared_savings_id = a.shared_savings_id
     and m.user_id = a.user_id
    where a.shared_savings_id = p_shared_savings_id
      and a.user_id <> v_caller_id
      and m.status = 'active';

    if v_other_approvers_count > 0 then
      raise exception 'Anda tidak dapat menyetujui/menolak pengajuan Anda sendiri ketika terdapat Approver aktif lainnya.';
    end if;
  end if;
end;
$$;


-- 4.7 Approve Contribution
create or replace function public.approve_shared_contribution(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_request public.shared_savings_requests;
  v_space public.shared_savings;
  v_transaction_id uuid;
  v_ledger_id uuid;
  v_total_allocations numeric;
  v_new_balance numeric;
  v_member record;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_request
  from public.shared_savings_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request is not pending (status: %).', v_request.status;
  end if;

  if v_request.request_type <> 'contribution' then
    raise exception 'Invalid request type for this action.';
  end if;

  -- Verify approver permission & conditional self-approval
  perform public.check_shared_approver_permission(v_request.shared_savings_id, v_request.requested_by_user_id);

  select * into v_space
  from public.shared_savings
  where id = v_request.shared_savings_id;

  if v_space.status <> 'active' then
    raise exception 'Shared savings space is not active.';
  end if;

  -- 1. Create personal wallet adjustment transaction (-amount)
  v_transaction_id := gen_random_uuid();
  v_ledger_id := gen_random_uuid();

  insert into public.transactions (
    id,
    user_id,
    type,
    amount,
    wallet_id,
    destination_wallet_id,
    transfer_fee,
    transaction_date,
    title,
    note,
    status,
    related_entity_type,
    related_entity_id
  ) values (
    v_transaction_id,
    v_request.requested_by_user_id,
    'adjustment',
    -v_request.amount,
    v_request.source_wallet_id,
    null,
    0,
    now(),
    'Setoran Tabungan Bersama: ' || v_space.name,
    v_request.note,
    'completed',
    'shared_savings_contribution',
    v_ledger_id
  );

  -- 2. Create Shared Savings Ledger event
  insert into public.shared_savings_ledger (
    id,
    shared_savings_id,
    request_id,
    event_type,
    amount,
    title,
    note
  ) values (
    v_ledger_id,
    v_space.id,
    v_request.id,
    'contribution',
    v_request.amount,
    'Setoran Anggota',
    v_request.note
  );

  -- 3. Create Member Allocation (+amount)
  insert into public.shared_savings_member_allocations (
    shared_savings_id,
    ledger_id,
    user_id,
    amount_signed
  ) values (
    v_space.id,
    v_ledger_id,
    v_request.requested_by_user_id,
    v_request.amount
  );

  -- 4. Financial Invariant Check
  select sum(amount_signed) into v_total_allocations
  from public.shared_savings_member_allocations
  where ledger_id = v_ledger_id;

  if v_total_allocations <> v_request.amount then
    raise exception 'Financial invariant failed: allocation total (%) != ledger amount (%).', v_total_allocations, v_request.amount;
  end if;

  -- 5. Mark request approved
  update public.shared_savings_requests
  set
    status = 'approved',
    approved_by_user_id = v_caller_id,
    approved_at = now(),
    transaction_id = v_transaction_id
  where id = p_request_id;

  -- 6. Check Target Reached Notification
  if v_space.target_amount is not null and v_space.target_amount > 0 then
    select coalesce(sum(
      case
        when event_type = 'contribution' then amount
        when event_type = 'personal_withdrawal' then -amount
        when event_type = 'shared_spending' then -amount
        when event_type = 'reversal' then amount
        else 0
      end
    ), 0) into v_new_balance
    from public.shared_savings_ledger
    where shared_savings_id = v_space.id;

    if v_new_balance >= v_space.target_amount then
      -- Attempt insert into dedupe logs
      insert into public.shared_savings_notification_logs (
        shared_savings_id,
        event_type,
        reference_value
      ) values (
        v_space.id,
        'target_reached',
        'target:' || v_space.target_amount::text
      )
      on conflict do nothing;

      -- If inserted successfully, notify all active members
      if found then
        for v_member in (
          select user_id from public.shared_savings_members
          where shared_savings_id = v_space.id and status = 'active'
        ) loop
          insert into public.notifications (
            user_id,
            type,
            title,
            message,
            entity_type,
            entity_id,
            metadata
          ) values (
            v_member.user_id,
            'shared_contribution_verified',
            'Target Tabungan Tercapai!',
            'Selamat! Saldo "' || v_space.name || '" telah mencapai target Rp' || to_char(v_space.target_amount, 'FM999,999,999,999') || '!',
            'shared_savings',
            v_space.id,
            jsonb_build_object(
              'shared_savings_id', v_space.id,
              'target_path', '/shared-savings/' || v_space.id::text
            )
          );
        end loop;
      end if;
    end if;
  end if;

  -- 7. Notify Requester
  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_request.requested_by_user_id,
    'shared_contribution_verified',
    'Setoran Tabungan Disetujui',
    'Setoran Anda sebesar Rp' || to_char(v_request.amount, 'FM999,999,999,999') || ' ke "' || v_space.name || '" telah diverifikasi dan masuk ke saldo.',
    'shared_savings',
    v_space.id,
    jsonb_build_object(
      'shared_savings_id', v_space.id,
      'request_id', v_request.id,
      'target_path', '/shared-savings/' || v_space.id::text
    )
  );

  return true;
end;
$$;

grant execute on function public.approve_shared_contribution(uuid) to authenticated;


-- 4.8 Approve Withdrawal
create or replace function public.approve_shared_withdrawal(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_request public.shared_savings_requests;
  v_space public.shared_savings;
  v_current_share numeric;
  v_transaction_id uuid;
  v_ledger_id uuid;
  v_total_allocations numeric;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_request
  from public.shared_savings_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request is not pending.';
  end if;

  if v_request.request_type <> 'withdrawal' then
    raise exception 'Invalid request type.';
  end if;

  -- Verify approver permission & conditional self-approval
  perform public.check_shared_approver_permission(v_request.shared_savings_id, v_request.requested_by_user_id);

  select * into v_space
  from public.shared_savings
  where id = v_request.shared_savings_id;

  if v_space.status <> 'active' then
    raise exception 'Shared savings space is not active.';
  end if;

  -- Verify requester still has sufficient available economic share
  select coalesce(sum(amount_signed), 0) into v_current_share
  from public.shared_savings_member_allocations
  where shared_savings_id = v_space.id
    and user_id = v_request.requested_by_user_id;

  if v_request.amount > v_current_share then
    raise exception 'Penarikan gagal: Porsi requester saat ini (Rp%) tidak mencukupi untuk menarik Rp%.',
      to_char(v_current_share, 'FM999,999,999,999'),
      to_char(v_request.amount, 'FM999,999,999,999');
  end if;

  -- 1. Create personal wallet adjustment transaction (+amount)
  v_transaction_id := gen_random_uuid();
  v_ledger_id := gen_random_uuid();

  insert into public.transactions (
    id,
    user_id,
    type,
    amount,
    wallet_id,
    destination_wallet_id,
    transfer_fee,
    transaction_date,
    title,
    note,
    status,
    related_entity_type,
    related_entity_id
  ) values (
    v_transaction_id,
    v_request.requested_by_user_id,
    'adjustment',
    v_request.amount,
    v_request.destination_wallet_id,
    null,
    0,
    now(),
    'Penarikan Tabungan Bersama: ' || v_space.name,
    v_request.note,
    'completed',
    'shared_savings_withdrawal',
    v_ledger_id
  );

  -- 2. Create Shared Savings Ledger event (-amount)
  insert into public.shared_savings_ledger (
    id,
    shared_savings_id,
    request_id,
    event_type,
    amount,
    title,
    note
  ) values (
    v_ledger_id,
    v_space.id,
    v_request.id,
    'personal_withdrawal',
    v_request.amount,
    'Penarikan Porsi Pribadi',
    v_request.note
  );

  -- 3. Create Member Allocation (-amount)
  insert into public.shared_savings_member_allocations (
    shared_savings_id,
    ledger_id,
    user_id,
    amount_signed
  ) values (
    v_space.id,
    v_ledger_id,
    v_request.requested_by_user_id,
    -v_request.amount
  );

  -- 4. Invariant Check
  select sum(amount_signed) into v_total_allocations
  from public.shared_savings_member_allocations
  where ledger_id = v_ledger_id;

  if v_total_allocations <> -v_request.amount then
    raise exception 'Financial invariant failed: allocation total (%) != -ledger amount (%).', v_total_allocations, -v_request.amount;
  end if;

  -- 5. Mark approved
  update public.shared_savings_requests
  set
    status = 'approved',
    approved_by_user_id = v_caller_id,
    approved_at = now(),
    transaction_id = v_transaction_id
  where id = p_request_id;

  -- 6. Notify Requester
  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_request.requested_by_user_id,
    'shared_contribution_verified',
    'Penarikan Porsi Disetujui',
    'Penarikan Rp' || to_char(v_request.amount, 'FM999,999,999,999') || ' dari "' || v_space.name || '" telah disetujui dan masuk ke dompet Anda.',
    'shared_savings',
    v_space.id,
    jsonb_build_object(
      'shared_savings_id', v_space.id,
      'request_id', v_request.id,
      'target_path', '/shared-savings/' || v_space.id::text
    )
  );

  return true;
end;
$$;

grant execute on function public.approve_shared_withdrawal(uuid) to authenticated;


-- 4.9 Approve Shared Spending (Approval-time Snapshot, Deterministic Integer Division + Remainder, Insufficient Share Check)
create or replace function public.approve_shared_spending(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_request public.shared_savings_requests;
  v_space public.shared_savings;
  v_active_count integer;
  v_base_share numeric;
  v_remainder integer;
  v_allocated_sum numeric;
  v_member record;
  v_member_idx integer;
  v_member_share_deduction numeric;
  v_member_curr_share numeric;
  v_ledger_id uuid;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_request
  from public.shared_savings_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request is not pending.';
  end if;

  if v_request.request_type <> 'shared_spending' then
    raise exception 'Invalid request type.';
  end if;

  -- Verify approver permission & conditional self-approval
  perform public.check_shared_approver_permission(v_request.shared_savings_id, v_request.requested_by_user_id);

  select * into v_space
  from public.shared_savings
  where id = v_request.shared_savings_id;

  if v_space.status <> 'active' then
    raise exception 'Shared savings space is not active.';
  end if;

  -- Get active members count at approval time
  select count(*) into v_active_count
  from public.shared_savings_members
  where shared_savings_id = v_space.id
    and status = 'active';

  if v_active_count = 0 then
    raise exception 'No active members available to allocate spending.';
  end if;

  -- Integer split in IDR
  v_base_share := floor(v_request.amount / v_active_count);
  v_remainder := (v_request.amount - (v_base_share * v_active_count))::integer;

  -- Create temporary table to hold snapshot & calculated shares
  create temp table temp_spending_split (
    user_id uuid primary key,
    allocation_amount numeric not null,
    current_share numeric not null,
    member_name text
  ) on commit drop;

  v_member_idx := 0;
  for v_member in (
    select
      m.user_id,
      m.joined_at,
      p.full_name,
      p.email,
      coalesce(sum(a.amount_signed), 0) as current_share
    from public.shared_savings_members m
    join public.profiles p on p.id = m.user_id
    left join public.shared_savings_member_allocations a
      on a.shared_savings_id = m.shared_savings_id
     and a.user_id = m.user_id
    where m.shared_savings_id = v_space.id
      and m.status = 'active'
    group by m.user_id, m.joined_at, p.full_name, p.email
    order by m.joined_at asc, m.user_id asc
  ) loop
    v_member_idx := v_member_idx + 1;
    -- Distribute 1 IDR each for remainder to earliest joined members
    if v_member_idx <= v_remainder then
      v_member_share_deduction := v_base_share + 1;
    else
      v_member_share_deduction := v_base_share;
    end if;

    -- INSUFFICIENT SHARE CHECK: Every active member must have sufficient individual share
    if v_member.current_share < v_member_share_deduction then
      raise exception 'Pengeluaran bersama tidak dapat disetujui: Porsi % (Rp%) tidak mencukupi untuk menanggung bagian pengeluaran Rp%.',
        coalesce(v_member.full_name, v_member.email),
        to_char(v_member.current_share, 'FM999,999,999,999'),
        to_char(v_member_share_deduction, 'FM999,999,999,999');
    end if;

    insert into temp_spending_split (
      user_id,
      allocation_amount,
      current_share,
      member_name
    ) values (
      v_member.user_id,
      v_member_share_deduction,
      v_member.current_share,
      coalesce(v_member.full_name, v_member.email)
    );
  end loop;

  -- 1. Create Shared Savings Ledger row
  v_ledger_id := gen_random_uuid();

  insert into public.shared_savings_ledger (
    id,
    shared_savings_id,
    request_id,
    event_type,
    amount,
    title,
    note
  ) values (
    v_ledger_id,
    v_space.id,
    v_request.id,
    'shared_spending',
    v_request.amount,
    coalesce(v_request.title, 'Pengeluaran Bersama'),
    v_request.note
  );

  -- 2. Insert member allocations
  insert into public.shared_savings_member_allocations (
    shared_savings_id,
    ledger_id,
    user_id,
    amount_signed
  )
  select
    v_space.id,
    v_ledger_id,
    user_id,
    -allocation_amount
  from temp_spending_split;

  -- 3. Invariant check: Assert exact sum of allocations equals -request.amount
  select sum(amount_signed) into v_allocated_sum
  from public.shared_savings_member_allocations
  where ledger_id = v_ledger_id;

  if v_allocated_sum <> -v_request.amount then
    raise exception 'Rounding invariant failed: allocations sum (%) != -amount (%).', v_allocated_sum, -v_request.amount;
  end if;

  -- 4. Mark request approved
  update public.shared_savings_requests
  set
    status = 'approved',
    approved_by_user_id = v_caller_id,
    approved_at = now()
  where id = p_request_id;

  -- 5. Notify all active members
  for v_member in (select user_id, allocation_amount from temp_spending_split) loop
    insert into public.notifications (
      user_id,
      type,
      title,
      message,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_member.user_id,
      'shared_contribution_verified',
      'Pengeluaran Bersama Disetujui',
      'Pengeluaran "' || coalesce(v_request.title, 'Bersama') || '" (Total Rp' || to_char(v_request.amount, 'FM999,999,999,999') || ') disetujui. Porsi Anda dipotong Rp' || to_char(v_member.allocation_amount, 'FM999,999,999,999') || '.',
      'shared_savings',
      v_space.id,
      jsonb_build_object(
        'shared_savings_id', v_space.id,
        'request_id', v_request.id,
        'target_path', '/shared-savings/' || v_space.id::text
      )
    );
  end loop;

  return true;
end;
$$;

grant execute on function public.approve_shared_spending(uuid) to authenticated;


-- 4.10 Reject Request
create or replace function public.reject_shared_request(
  p_request_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_request public.shared_savings_requests;
  v_space public.shared_savings;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_request
  from public.shared_savings_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request is not pending.';
  end if;

  -- Verify approver permission & conditional self-approval
  perform public.check_shared_approver_permission(v_request.shared_savings_id, v_request.requested_by_user_id);

  select * into v_space
  from public.shared_savings
  where id = v_request.shared_savings_id;

  update public.shared_savings_requests
  set
    status = 'rejected',
    rejected_by_user_id = v_caller_id,
    rejected_at = now(),
    rejection_reason = p_reason
  where id = p_request_id;

  -- Notify Requester
  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_request.requested_by_user_id,
    'shared_contribution_rejected',
    'Pengajuan Ditolak',
    'Pengajuan ' || v_request.request_type || ' Anda sebesar Rp' || to_char(v_request.amount, 'FM999,999,999,999') || ' ditolak.' || case when p_reason is not null and length(trim(p_reason)) > 0 then ' Alasan: ' || p_reason else '' end,
    'shared_savings',
    v_space.id,
    jsonb_build_object(
      'shared_savings_id', v_space.id,
      'request_id', v_request.id,
      'target_path', '/shared-savings/' || v_space.id::text
    )
  );

  return true;
end;
$$;

grant execute on function public.reject_shared_request(uuid, text) to authenticated;


-- 4.11 Cancel Request (Requester only)
create or replace function public.cancel_shared_request(
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_request public.shared_savings_requests;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_request
  from public.shared_savings_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  if v_request.requested_by_user_id <> v_caller_id then
    raise exception 'You can only cancel your own requests.';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request is no longer pending.';
  end if;

  update public.shared_savings_requests
  set
    status = 'cancelled'
  where id = p_request_id;

  return true;
end;
$$;

grant execute on function public.cancel_shared_request(uuid) to authenticated;


-- 4.12 Update Shared Savings Settings (Owner only)
create or replace function public.update_shared_savings_settings(
  p_shared_savings_id uuid,
  p_name text,
  p_target_amount numeric default null,
  p_deadline date default null,
  p_icon text default null,
  p_color text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_space public.shared_savings;
  v_clean_name text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null then
    raise exception 'Shared savings space not found.';
  end if;

  if v_space.owner_user_id <> v_caller_id then
    raise exception 'Only the Owner can update space settings.';
  end if;

  v_clean_name := trim(coalesce(p_name, ''));
  if length(v_clean_name) = 0 then
    raise exception 'Name cannot be empty.';
  end if;

  if p_target_amount is not null and p_target_amount <= 0 then
    raise exception 'Target amount must be greater than zero.';
  end if;

  update public.shared_savings
  set
    name = v_clean_name,
    target_amount = p_target_amount,
    deadline = p_deadline,
    icon = coalesce(p_icon, icon),
    color = coalesce(p_color, color),
    updated_at = now()
  where id = p_shared_savings_id;

  return true;
end;
$$;

grant execute on function public.update_shared_savings_settings(uuid, text, numeric, date, text, text) to authenticated;


-- 4.13 Transfer Ownership (Owner only, new owner must be active member)
create or replace function public.transfer_shared_savings_ownership(
  p_shared_savings_id uuid,
  p_new_owner_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_space public.shared_savings;
  v_new_owner_name text;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null then
    raise exception 'Shared savings space not found.';
  end if;

  if v_space.owner_user_id <> v_caller_id then
    raise exception 'Only the Owner can transfer ownership.';
  end if;

  if v_caller_id = p_new_owner_user_id then
    raise exception 'You are already the Owner.';
  end if;

  -- New owner must be an active member
  if not exists (
    select 1 from public.shared_savings_members
    where shared_savings_id = p_shared_savings_id
      and user_id = p_new_owner_user_id
      and status = 'active'
  ) then
    raise exception 'New owner must already be an active member of this space.';
  end if;

  update public.shared_savings
  set
    owner_user_id = p_new_owner_user_id,
    updated_at = now()
  where id = p_shared_savings_id;

  -- Ensure new owner is also granted Approver role if not already
  insert into public.shared_savings_approvers (
    shared_savings_id,
    user_id
  ) values (
    p_shared_savings_id,
    p_new_owner_user_id
  )
  on conflict do nothing;

  -- Notify new owner
  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_new_owner_user_id,
    'shared_invitation',
    'Kepemilikan Tabungan Bersama Dialihkan',
    'Anda kini adalah Owner dari "' || v_space.name || '".',
    'shared_savings',
    p_shared_savings_id,
    jsonb_build_object(
      'shared_savings_id', p_shared_savings_id,
      'target_path', '/shared-savings/' || p_shared_savings_id::text
    )
  );

  return true;
end;
$$;

grant execute on function public.transfer_shared_savings_ownership(uuid, uuid) to authenticated;


-- 4.14 Set Account Holder (Owner only, target user must be active member)
create or replace function public.set_shared_savings_account_holder(
  p_shared_savings_id uuid,
  p_new_account_holder_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_space public.shared_savings;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null then
    raise exception 'Shared savings space not found.';
  end if;

  if v_space.owner_user_id <> v_caller_id then
    raise exception 'Only the Owner can assign the Account Holder.';
  end if;

  -- Target user must be an active member
  if not exists (
    select 1 from public.shared_savings_members
    where shared_savings_id = p_shared_savings_id
      and user_id = p_new_account_holder_user_id
      and status = 'active'
  ) then
    raise exception 'Account Holder must be an active member of this space.';
  end if;

  update public.shared_savings
  set
    account_holder_user_id = p_new_account_holder_user_id,
    updated_at = now()
  where id = p_shared_savings_id;

  return true;
end;
$$;

grant execute on function public.set_shared_savings_account_holder(uuid, uuid) to authenticated;


-- 4.15 Set / Toggle Approver (Owner only, target user must be active member, >= 1 approver required)
create or replace function public.set_shared_savings_approver(
  p_shared_savings_id uuid,
  p_user_id uuid,
  p_is_approver boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_space public.shared_savings;
  v_approver_count integer;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null then
    raise exception 'Shared savings space not found.';
  end if;

  if v_space.owner_user_id <> v_caller_id then
    raise exception 'Only the Owner can manage Approver roles.';
  end if;

  -- Target user must be an active member
  if not exists (
    select 1 from public.shared_savings_members
    where shared_savings_id = p_shared_savings_id
      and user_id = p_user_id
      and status = 'active'
  ) then
    raise exception 'Approver must be an active member of this space.';
  end if;

  if p_is_approver then
    insert into public.shared_savings_approvers (
      shared_savings_id,
      user_id
    ) values (
      p_shared_savings_id,
      p_user_id
    )
    on conflict do nothing;
  else
    -- Verify at least 1 other active approver remains
    select count(*) into v_approver_count
    from public.shared_savings_approvers a
    join public.shared_savings_members m
      on m.shared_savings_id = a.shared_savings_id
     and m.user_id = a.user_id
    where a.shared_savings_id = p_shared_savings_id
      and a.user_id <> p_user_id
      and m.status = 'active';

    if v_approver_count = 0 then
      raise exception 'Cannot remove the last remaining Approver. Space must always have at least one active Approver.';
    end if;

    delete from public.shared_savings_approvers
    where shared_savings_id = p_shared_savings_id
      and user_id = p_user_id;
  end if;

  return true;
end;
$$;

grant execute on function public.set_shared_savings_approver(uuid, uuid, boolean) to authenticated;


-- 4.16 Remove Member / Leave Space
create or replace function public.remove_shared_savings_member(
  p_shared_savings_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid;
  v_space public.shared_savings;
  v_current_share numeric;
  v_approver_count integer;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_space
  from public.shared_savings
  where id = p_shared_savings_id;

  if v_space.id is null then
    raise exception 'Shared savings space not found.';
  end if;

  -- Only Owner or the member themselves can perform leave/remove
  if v_space.owner_user_id <> v_caller_id and p_user_id <> v_caller_id then
    raise exception 'You do not have permission to remove this member.';
  end if;

  -- Owner cannot leave while still Owner
  if p_user_id = v_space.owner_user_id then
    raise exception 'Owner cannot leave the space. Transfer ownership to another active member first.';
  end if;

  -- Account Holder cannot leave while assigned as Account Holder
  if p_user_id = v_space.account_holder_user_id then
    raise exception 'Account Holder cannot leave the space. Assign a replacement Account Holder first.';
  end if;

  -- Financial share must be 0
  select coalesce(sum(amount_signed), 0) into v_current_share
  from public.shared_savings_member_allocations
  where shared_savings_id = p_shared_savings_id
    and user_id = p_user_id;

  if v_current_share <> 0 then
    raise exception 'Member cannot leave while having an unresolved share balance (Porsi saat ini: Rp%). Tarik porsi hingga 0 terlebih dahulu.',
      to_char(v_current_share, 'FM999,999,999,999');
  end if;

  -- No pending requests
  if exists (
    select 1 from public.shared_savings_requests
    where shared_savings_id = p_shared_savings_id
      and requested_by_user_id = p_user_id
      and status = 'pending'
  ) then
    raise exception 'Member cannot leave while having pending requests under review.';
  end if;

  -- If user is an Approver, ensure at least one other active approver remains
  if exists (
    select 1 from public.shared_savings_approvers
    where shared_savings_id = p_shared_savings_id
      and user_id = p_user_id
  ) then
    select count(*) into v_approver_count
    from public.shared_savings_approvers a
    join public.shared_savings_members m
      on m.shared_savings_id = a.shared_savings_id
     and m.user_id = a.user_id
    where a.shared_savings_id = p_shared_savings_id
      and a.user_id <> p_user_id
      and m.status = 'active';

    if v_approver_count = 0 then
      raise exception 'Cannot remove member: this user is the only active Approver. Assign another Approver first.';
    end if;

    delete from public.shared_savings_approvers
    where shared_savings_id = p_shared_savings_id
      and user_id = p_user_id;
  end if;

  -- Mark member as left
  update public.shared_savings_members
  set
    status = case when p_user_id = v_caller_id then 'left' else 'removed' end,
    left_at = now(),
    updated_at = now()
  where shared_savings_id = p_shared_savings_id
    and user_id = p_user_id
    and status = 'active';

  return true;
end;
$$;

grant execute on function public.remove_shared_savings_member(uuid, uuid) to authenticated;
