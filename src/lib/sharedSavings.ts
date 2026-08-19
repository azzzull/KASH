import { supabase } from "./supabase";
import type {
  SharedSavings,
  SharedSavingsBalance,
  SharedSavingsInvite,
  SharedSavingsLedger,
  SharedSavingsMember,
  SharedSavingsMemberShare,
  SharedSavingsRequest,
  SharedSavingsSpaceSummary,
} from "../types/domain";
import { toNumber } from "./money";

async function getAuthenticatedUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("You need to be signed in to perform this action.");

  return user.id;
}

/**
 * Fetch all shared savings spaces where the user is an owner, active member, or past member.
 */
export async function getSharedSavingsSpaces(): Promise<SharedSavingsSpaceSummary[]> {
  const userId = await getAuthenticatedUserId();

  // 1. Fetch balances view
  const { data: spacesData, error: spacesError } = await supabase
    .from("shared_savings_balance_view")
    .select("*")
    .order("created_at", { ascending: false });

  if (spacesError) throw spacesError;
  if (!spacesData || spacesData.length === 0) return [];

  const spaceIds = spacesData.map((s) => s.shared_savings_id);

  // 2. Fetch member shares for current user and all profiles
  const [sharesResult, approversResult, requestsResult, profilesResult] = await Promise.all([
    supabase
      .from("shared_savings_member_shares_view")
      .select("*")
      .in("shared_savings_id", spaceIds),
    supabase
      .from("shared_savings_approvers")
      .select("*")
      .in("shared_savings_id", spaceIds),
    supabase
      .from("shared_savings_requests")
      .select("id, shared_savings_id, status")
      .in("shared_savings_id", spaceIds)
      .eq("status", "pending"),
    supabase
      .from("profiles")
      .select("id, full_name, email"),
  ]);

  if (sharesResult.error) throw sharesResult.error;
  if (approversResult.error) throw approversResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const profilesMap = new Map((profilesResult.data ?? []).map((p) => [p.id, p.full_name || p.email]));
  const userSharesMap = new Map<string, number>();
  (sharesResult.data ?? []).forEach((row) => {
    if (row.user_id === userId) {
      userSharesMap.set(row.shared_savings_id, toNumber(row.current_share));
    }
  });

  const approverSet = new Set(
    (approversResult.data ?? [])
      .filter((a) => a.user_id === userId)
      .map((a) => a.shared_savings_id)
  );

  const pendingCountBySpace = new Map<string, number>();
  (requestsResult.data ?? []).forEach((r) => {
    pendingCountBySpace.set(r.shared_savings_id, (pendingCountBySpace.get(r.shared_savings_id) ?? 0) + 1);
  });

  const mySpaces = spacesData.filter((space) => {
    return space.owner_user_id === userId || userSharesMap.has(space.shared_savings_id);
  });

  return mySpaces.map((space): SharedSavingsSpaceSummary => {
    const isOwner = space.owner_user_id === userId;
    const isAccountHolder = space.account_holder_user_id === userId;
    const isApprover = approverSet.has(space.shared_savings_id);
    const myShare = userSharesMap.get(space.shared_savings_id) ?? 0;
    const pendingCount = pendingCountBySpace.get(space.shared_savings_id) ?? 0;

    return {
      space: {
        ...space,
        current_balance: toNumber(space.current_balance),
        total_contributions: toNumber(space.total_contributions),
        total_withdrawals: toNumber(space.total_withdrawals),
        total_spending: toNumber(space.total_spending),
        active_members_count: space.active_members_count ?? 1,
      },
      myShare,
      isOwner,
      isAccountHolder,
      isApprover,
      pendingRequestsCount: pendingCount,
      ownerName: profilesMap.get(space.owner_user_id) ?? "Unknown",
      accountHolderName: profilesMap.get(space.account_holder_user_id) ?? "Unknown",
    };
  });
}

/**
 * Fetch detailed space by ID.
 */
export async function getSharedSavingsDetail(spaceId: string): Promise<{
  space: SharedSavingsBalance;
  members: SharedSavingsMemberShare[];
  requests: SharedSavingsRequest[];
  ledger: SharedSavingsLedger[];
  invites: SharedSavingsInvite[];
  approvers: string[]; // user_ids
  myShare: number;
  isOwner: boolean;
  isAccountHolder: boolean;
  isApprover: boolean;
  otherApproversCount: number;
}> {
  const userId = await getAuthenticatedUserId();

  const [
    spaceResult,
    membersResult,
    approversResult,
    requestsResult,
    ledgerResult,
    walletsResult,
    invitesResult,
  ] = await Promise.all([
    supabase
      .from("shared_savings_balance_view")
      .select("*")
      .eq("shared_savings_id", spaceId)
      .single(),
    supabase
      .from("shared_savings_member_shares_view")
      .select("*")
      .eq("shared_savings_id", spaceId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("shared_savings_approvers")
      .select("user_id")
      .eq("shared_savings_id", spaceId),
    supabase
      .from("shared_savings_requests")
      .select("*, requester:profiles!requested_by_user_id(full_name, email, avatar_url)")
      .eq("shared_savings_id", spaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("shared_savings_ledger")
      .select("*")
      .eq("shared_savings_id", spaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("wallets")
      .select("id, name"),
    supabase
      .from("shared_savings_invites")
      .select("*")
      .eq("shared_savings_id", spaceId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  if (spaceResult.error) throw spaceResult.error;
  if (membersResult.error) throw membersResult.error;
  if (approversResult.error) throw approversResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (ledgerResult.error) throw ledgerResult.error;

  const space = spaceResult.data as SharedSavingsBalance;
  const approverIds = (approversResult.data ?? []).map((a) => a.user_id);
  const isOwner = space.owner_user_id === userId;
  const isAccountHolder = space.account_holder_user_id === userId;
  const isApprover = approverIds.includes(userId);

  // Active approvers excluding current user
  const activeMembersSet = new Set((membersResult.data ?? []).filter((m) => m.member_status === "active").map((m) => m.user_id));
  const otherApproversCount = approverIds.filter((id) => id !== userId && activeMembersSet.has(id)).length;

  const members: SharedSavingsMemberShare[] = (membersResult.data ?? []).map((m) => ({
    ...m,
    current_share: toNumber(m.current_share),
    total_contributed: toNumber(m.total_contributed),
    total_withdrawn: toNumber(m.total_withdrawn),
    total_spent_allocated: toNumber(m.total_spent_allocated),
    is_owner: m.user_id === space.owner_user_id,
    is_account_holder: m.user_id === space.account_holder_user_id,
    is_approver: approverIds.includes(m.user_id),
  }));

  const myMember = members.find((m) => m.user_id === userId);
  const myShare = myMember ? toNumber(myMember.current_share) : 0;

  const walletNameMap = new Map((walletsResult.data ?? []).map((w) => [w.id, w.name]));

  const requests: SharedSavingsRequest[] = (requestsResult.data ?? []).map((r: any) => ({
    ...r,
    amount: toNumber(r.amount),
    requester_name: r.requester?.full_name || r.requester?.email || null,
    requester_email: r.requester?.email || null,
    requester_avatar_url: r.requester?.avatar_url || null,
    source_wallet_name: r.source_wallet_id ? walletNameMap.get(r.source_wallet_id) || "Wallet" : null,
    destination_wallet_name: r.destination_wallet_id ? walletNameMap.get(r.destination_wallet_id) || "Wallet" : null,
  }));

  const requestMap = new Map(requests.map((r) => [r.id, r]));
  const memberNameMap = new Map(members.map((m) => [m.user_id, m.member_name || m.member_email || "Anggota"]));

  const ledger: SharedSavingsLedger[] = (ledgerResult.data ?? []).map((l) => {
    const req = requestMap.get(l.request_id);
    const reqName = req?.requester_name || (req?.requested_by_user_id ? memberNameMap.get(req.requested_by_user_id) : null);
    return {
      ...l,
      amount: toNumber(l.amount),
      requester_name: reqName || null,
      requester_user_id: req?.requested_by_user_id || null,
      requester_avatar_url: req?.requester_avatar_url || null,
    };
  });

  const invites: SharedSavingsInvite[] = (invitesResult.data ?? []).map((inv) => ({
    ...inv,
  }));

  return {
    space: {
      ...space,
      current_balance: toNumber(space.current_balance),
      total_contributions: toNumber(space.total_contributions),
      total_withdrawals: toNumber(space.total_withdrawals),
      total_spending: toNumber(space.total_spending),
    },
    members,
    requests,
    ledger,
    invites,
    approvers: approverIds,
    myShare,
    isOwner,
    isAccountHolder,
    isApprover,
    otherApproversCount,
  };
}

/**
 * Fetch pending invitations for the current user.
 */
export async function getPendingSharedSavingsInvites(): Promise<SharedSavingsInvite[]> {
  const userId = await getAuthenticatedUserId();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userEmail = user?.email?.toLowerCase() ?? "";

  const { data, error } = await supabase
    .from("shared_savings_invites")
    .select(`
      *,
      shared_savings:shared_savings(id, name, icon, color, target_amount, deadline, owner_user_id),
      inviter:profiles!inviter_user_id(full_name, email)
    `)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .or(`invited_user_id.eq.${userId},invited_email.eq.${userEmail}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const ownerUserIds = Array.from(
    new Set(data.map((inv: any) => inv.shared_savings?.owner_user_id).filter(Boolean))
  );

  let ownerMap = new Map<string, string>();
  if (ownerUserIds.length > 0) {
    const { data: ownerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ownerUserIds);
    ownerMap = new Map((ownerProfiles ?? []).map((p) => [p.id, p.full_name || p.email]));
  }

  return (data ?? []).map((inv: any) => ({
    ...inv,
    inviter_name: inv.inviter?.full_name || inv.inviter?.email || "User",
    inviter_email: inv.inviter?.email || null,
    owner_name: ownerMap.get(inv.shared_savings?.owner_user_id) || "User",
  }));
}

/**
 * Total user's positive shares across all active and historical Shared Savings spaces.
 * Used for accurate Net Worth calculation.
 */
export async function getUserTotalSharedSavingsShare(userId?: string): Promise<number> {
  const uid = userId ?? (await getAuthenticatedUserId());

  const { data, error } = await supabase
    .from("shared_savings_member_shares_view")
    .select("current_share")
    .eq("user_id", uid);

  if (error) throw error;

  return (data ?? []).reduce((sum, row) => {
    const share = toNumber(row.current_share);
    return share > 0 ? sum + share : sum;
  }, 0);
}

// ============================================================
// RPC OPERATIONS
// ============================================================

export async function createSharedSavingsSpace(input: {
  name: string;
  targetAmount?: number | null;
  deadline?: string | null;
  icon?: string;
  color?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_shared_savings", {
    p_name: input.name,
    p_target_amount: input.targetAmount ?? null,
    p_deadline: input.deadline ?? null,
    p_icon: input.icon ?? "users",
    p_color: input.color ?? "#10B981",
  });

  if (error) throw error;
  return data as string;
}

export async function inviteSharedSavingsMember(spaceId: string, email: string): Promise<string> {
  const { data, error } = await supabase.rpc("invite_shared_savings_member", {
    p_shared_savings_id: spaceId,
    p_email: email,
  });

  if (error) throw error;
  return data as string;
}

export async function respondToSharedSavingsInvite(inviteId: string, action: "accept" | "reject"): Promise<boolean> {
  const { data, error } = await supabase.rpc("respond_shared_savings_invite", {
    p_invite_id: inviteId,
    p_action: action,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function submitContributionRequest(input: {
  spaceId: string;
  sourceWalletId: string;
  amount: number;
  note?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_shared_contribution_request", {
    p_shared_savings_id: input.spaceId,
    p_source_wallet_id: input.sourceWalletId,
    p_amount: input.amount,
    p_note: input.note ?? null,
  });

  if (error) throw error;
  return data as string;
}

export async function submitWithdrawalRequest(input: {
  spaceId: string;
  destinationWalletId: string;
  amount: number;
  note?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_shared_withdrawal_request", {
    p_shared_savings_id: input.spaceId,
    p_destination_wallet_id: input.destinationWalletId,
    p_amount: input.amount,
    p_note: input.note ?? null,
  });

  if (error) throw error;
  return data as string;
}

export async function submitSharedSpendingRequest(input: {
  spaceId: string;
  title: string;
  amount: number;
  note?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_shared_spending_request", {
    p_shared_savings_id: input.spaceId,
    p_title: input.title,
    p_amount: input.amount,
    p_note: input.note ?? null,
  });

  if (error) throw error;
  return data as string;
}

export async function approveSharedContribution(requestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("approve_shared_contribution", {
    p_request_id: requestId,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function approveSharedWithdrawal(requestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("approve_shared_withdrawal", {
    p_request_id: requestId,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function approveSharedSpending(requestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("approve_shared_spending", {
    p_request_id: requestId,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function rejectSharedRequest(requestId: string, reason?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("reject_shared_request", {
    p_request_id: requestId,
    p_reason: reason ?? null,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function cancelSharedRequest(requestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("cancel_shared_request", {
    p_request_id: requestId,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function updateSharedSavingsSettings(input: {
  spaceId: string;
  name: string;
  targetAmount?: number | null;
  deadline?: string | null;
  icon?: string;
  color?: string;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc("update_shared_savings_settings", {
    p_shared_savings_id: input.spaceId,
    p_name: input.name,
    p_target_amount: input.targetAmount ?? null,
    p_deadline: input.deadline ?? null,
    p_icon: input.icon ?? null,
    p_color: input.color ?? null,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function transferSharedSavingsOwnership(spaceId: string, newOwnerUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("transfer_shared_savings_ownership", {
    p_shared_savings_id: spaceId,
    p_new_owner_user_id: newOwnerUserId,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function setSharedSavingsAccountHolder(spaceId: string, newAccountHolderUserId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_shared_savings_account_holder", {
    p_shared_savings_id: spaceId,
    p_new_account_holder_user_id: newAccountHolderUserId,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function setSharedSavingsApprover(spaceId: string, userId: string, isApprover: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_shared_savings_approver", {
    p_shared_savings_id: spaceId,
    p_user_id: userId,
    p_is_approver: isApprover,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function removeSharedSavingsMember(spaceId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("remove_shared_savings_member", {
    p_shared_savings_id: spaceId,
    p_user_id: userId,
  });

  if (error) throw error;
  return Boolean(data);
}
