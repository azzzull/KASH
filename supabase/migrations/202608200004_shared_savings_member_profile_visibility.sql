-- ==============================================================================
-- KASH MIGRATION: Shared Savings Member Profile Visibility Refinement
-- File: 202608200004_shared_savings_member_profile_visibility.sql
-- ==============================================================================
-- Problem:
-- When active members of a Shared Savings space query the member roster view
-- (shared_savings_member_shares_view), PostgreSQL inner-joins profiles p ON p.id = m.user_id.
-- Because the default RLS policy on profiles only allowed (auth.uid() = id), other active
-- co-members in the space had their profile rows filtered out by RLS, causing the inner join
-- to drop all other members from the roster.
--
-- Solution:
-- Create a secure helper function can_view_profile() that grants authenticated users
-- read access to profiles of:
-- 1. Their own profile (auth.uid() = id).
-- 2. Active co-members in any Shared Savings space they are a member/owner of.
-- 3. The Owner or Account Holder of a Shared Savings space they belong to.
-- 4. An inviter who invited them to a Shared Savings space.
-- 5. An invitee of a Shared Savings space they manage.
--
-- This strictly isolates profile visibility to legitimate co-members within shared spaces,
-- preventing any global directory leakage.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.can_view_profile(p_viewer_id uuid, p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    p_viewer_id = p_target_user_id
    OR EXISTS (
      SELECT 1
      FROM public.shared_savings_members m1
      JOIN public.shared_savings_members m2 ON m1.shared_savings_id = m2.shared_savings_id
      WHERE m1.user_id = p_viewer_id
        AND m1.status = 'active'
        AND m2.user_id = p_target_user_id
        AND m2.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.shared_savings ss
      WHERE (ss.owner_user_id = p_viewer_id OR is_shared_savings_member(ss.id, p_viewer_id))
        AND (ss.owner_user_id = p_target_user_id OR ss.account_holder_user_id = p_target_user_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.shared_savings_invites inv
      WHERE (inv.invited_user_id = p_viewer_id OR inv.invited_email = (SELECT email FROM auth.users WHERE id = p_viewer_id))
        AND inv.inviter_user_id = p_target_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.shared_savings_invites inv
      WHERE (is_shared_savings_owner(inv.shared_savings_id, p_viewer_id) OR is_shared_savings_member(inv.shared_savings_id, p_viewer_id))
        AND inv.invited_user_id = p_target_user_id
    )
  );
$$;

-- Drop old single-user SELECT policy if exists
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own and shared savings co-member profiles" ON public.profiles;

-- Create updated SELECT policy on profiles
CREATE POLICY "Users can read own and shared savings co-member profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  can_view_profile(auth.uid(), id)
);
