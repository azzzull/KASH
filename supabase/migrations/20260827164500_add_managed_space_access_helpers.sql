-- ============================================================
-- KASH: Managed Space Access Helpers + financial_spaces RLS
-- Phase 5A.2
-- ============================================================

-- 1. Create minimal SECURITY DEFINER helpers for authorization to avoid RLS recursion
create or replace function public.user_has_managed_space_access(p_space_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.managed_space_members m
    join public.financial_spaces s on s.id = m.space_id
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and s.space_type = 'managed'
  );
$$;

create or replace function public.user_has_managed_space_role(p_space_id uuid, p_allowed_roles public.managed_space_role[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.managed_space_members m
    join public.financial_spaces s on s.id = m.space_id
    where m.space_id = p_space_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and s.space_type = 'managed'
      and m.role = any(p_allowed_roles)
  );
$$;

-- 2. Update ONLY financial_spaces SELECT/access policies
-- Personal: owner only
-- Managed: owner OR active member

drop policy if exists "Users can view their own financial spaces" on public.financial_spaces;
create policy "Users can view financial spaces" on public.financial_spaces
for select using (
  owner_user_id = auth.uid() 
  or 
  (space_type = 'managed' and public.user_has_managed_space_access(id))
);
