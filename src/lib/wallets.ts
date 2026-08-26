import type { CurrencyCode, InvestmentActivity, InvestmentActivityType, InvestmentValuation, Wallet, WalletBalance, WalletType } from "../types/domain";
import type { Database } from "../types/database";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";

type CreateFirstWalletInput = {
  name: string;
  walletType: WalletType;
  institutionName: string | null;
  initialBalance: string;
  currency: CurrencyCode;
  includeInNetWorth: boolean;
  icon?: string | null;
  color?: string | null;
};

export type WalletWithBalance = Wallet & {
  balance: WalletBalance | null;
  goal_id?: string | null;
  goal_name?: string | null;
  goal_target_amount?: string | number | null;
};

export type CreateWalletInput = CreateFirstWalletInput;

export type UpdateWalletInput = {
  name: string;
  walletType: WalletType;
  institutionName: string | null;
  initialBalance?: string;
  currency: CurrencyCode;
  includeInNetWorth: boolean;
  icon: string | null;
  color: string | null;
};

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You need to be signed in to manage wallets.");
  }

  return user.id;
}

function attachBalances(wallets: any[], balances: WalletBalance[]): WalletWithBalance[] {
  return wallets.map((wallet) => ({
    ...wallet,
    balance: balances.find((balance) => balance.wallet_id === wallet.id) ?? null,
  }));
}

export async function getWallets(spaceId?: string, isArchived: boolean = false) {
  const targetSpaceId = spaceId ?? getActiveSpaceId();
  let query = supabase
    .from("wallets")
    .select("*, goals!goals_wallet_id_fkey(id, name, target_amount, deadline, status)")
    .eq("is_archived", isArchived)
    .order("created_at", { ascending: true });

  if (targetSpaceId) {
    query = query.eq("space_id", targetSpaceId);
  }

  const { data: wallets, error: walletError } = await query;

  if (walletError || !wallets) {
    return { data: null, error: walletError };
  }

  const { data: balances, error: balanceError } = await supabase.from("wallet_balance_view").select("*");

  if (balanceError || !balances) {
    return { data: null, error: balanceError };
  }

  const mappedWallets = (wallets as any[]).map((w) => {
    const linkedGoal = Array.isArray(w.goals) ? w.goals[0] : w.goals;
    return {
      ...w,
      goal_id: linkedGoal?.id ?? null,
      goal_name: linkedGoal?.name ?? null,
      goal_target_amount: linkedGoal?.target_amount ?? null,
    };
  });

  return { data: attachBalances(mappedWallets, balances), error: null };
}

export async function getArchivedWalletsCount(spaceId?: string) {
  const targetSpaceId = spaceId ?? getActiveSpaceId();
  let query = supabase
    .from("wallets")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", true);

  if (targetSpaceId) {
    query = query.eq("space_id", targetSpaceId);
  }

  const { count, error } = await query;
  return { count: count ?? 0, error };
}

export async function getWalletById(id: string) {
  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("*, goals!goals_wallet_id_fkey(id, name, target_amount, deadline, status)")
    .eq("id", id)
    .single();

  if (walletError || !wallet) {
    return { data: null, error: walletError };
  }

  const { data: balance, error: balanceError } = await supabase
    .from("wallet_balance_view")
    .select("*")
    .eq("wallet_id", id)
    .single();

  if (balanceError) {
    return { data: null, error: balanceError };
  }

  const linkedGoal = Array.isArray((wallet as any).goals) ? (wallet as any).goals[0] : (wallet as any).goals;

  return {
    data: {
      ...wallet,
      balance,
      goal_id: linkedGoal?.id ?? null,
      goal_name: linkedGoal?.name ?? null,
      goal_target_amount: linkedGoal?.target_amount ?? null,
    } as WalletWithBalance,
    error: null,
  };
}

export async function getWalletTransactionCount(walletId: string) {
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("status", "completed")
    .or(`wallet_id.eq.${walletId},destination_wallet_id.eq.${walletId}`);

  return { count: count ?? 0, error };
}

export async function getWalletLinkedGoalCount(walletId: string) {
  const [{ count: destinationGoalCount, error: destinationGoalError }, { count: sourceContributionCount, error: sourceContributionError }] =
    await Promise.all([
      supabase
        .from("goals")
        .select("id", { count: "exact", head: true })
        .eq("wallet_id", walletId)
        .neq("status", "cancelled"),
      supabase
        .from("goal_contributions")
        .select("id", { count: "exact", head: true })
        .eq("wallet_id", walletId),
    ]);

  return {
    count: (destinationGoalCount ?? 0) + (sourceContributionCount ?? 0),
    error: destinationGoalError ?? sourceContributionError,
  };
}

export async function createWallet(input: CreateWalletInput, spaceId?: string) {
  const userId = await getAuthenticatedUserId();
  const targetSpaceId = spaceId ?? getActiveSpaceId() ?? undefined;

  return supabase
    .from("wallets")
    .insert({
      user_id: userId,
      space_id: targetSpaceId,
      name: input.name,
      wallet_type: input.walletType,
      institution_name: input.institutionName,
      initial_balance: input.initialBalance,
      currency: input.currency,
      include_in_net_worth: input.includeInNetWorth,
      icon: input.icon ?? null,
      color: input.color ?? null,
    })
    .select("*")
    .single();
}

export async function createFirstWallet(input: CreateFirstWalletInput, spaceId?: string) {
  return createWallet(input, spaceId);
}

export async function updateWallet(id: string, input: UpdateWalletInput) {
  const updatePayload: Database["public"]["Tables"]["wallets"]["Update"] = {
    name: input.name,
    wallet_type: input.walletType,
    institution_name: input.institutionName,
    currency: input.currency,
    include_in_net_worth: input.includeInNetWorth,
    icon: input.icon,
    color: input.color,
  };

  if (input.initialBalance !== undefined) {
    updatePayload.initial_balance = input.initialBalance;
  }

  return supabase
    .from("wallets")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();
}

export async function archiveWallet(id: string) {
  return supabase.from("wallets").update({ is_archived: true }).eq("id", id).select("*").single();
}

export async function restoreWallet(id: string) {
  return supabase.from("wallets").update({ is_archived: false }).eq("id", id).select("*").single();
}

export async function deleteWallet(id: string) {
  return supabase.from("wallets").delete().eq("id", id).select("*").single();
}

export async function deleteWalletPermanently(id: string) {
  return supabase.rpc("delete_wallet_permanently", { p_wallet_id: id });
}

export async function recordInvestmentValuation(input: {
  walletId: string;
  marketValue: number | string;
  valuationDate?: string;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc("update_investment_valuation", {
    p_wallet_id: input.walletId,
    p_market_value: typeof input.marketValue === "string" ? Number(input.marketValue) : input.marketValue,
    p_valuation_date: input.valuationDate || new Date().toISOString(),
    p_note: input.note?.trim() || null,
  });

  if (error) throw error;
  return { data, error: null };
}

export async function getInvestmentValuationHistory(walletId: string) {
  const { data, error } = await supabase
    .from("investment_valuations")
    .select("*")
    .eq("wallet_id", walletId)
    .order("valuation_date", { ascending: false });

  if (error) throw error;
  return { data: (data as InvestmentValuation[]) ?? [], error: null };
}

export async function getInvestmentActivities(walletId: string) {
  const { data, error } = await supabase
    .from("investment_activities")
    .select("*")
    .eq("wallet_id", walletId)
    .order("activity_date", { ascending: false });

  if (error) throw error;
  return { data: (data as InvestmentActivity[]) ?? [], error: null };
}

export async function recordInvestmentActivity(input: {
  walletId: string;
  activityType: InvestmentActivityType;
  amount: number | string;
  activityDate?: string;
  note?: string | null;
}) {
  const { data, error } = await supabase
    .from("investment_activities")
    .insert({
      wallet_id: input.walletId,
      activity_type: input.activityType,
      amount: typeof input.amount === "string" ? Number(input.amount) : input.amount,
      activity_date: input.activityDate || new Date().toISOString(),
      note: input.note?.trim() || null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return { data: data as InvestmentActivity, error: null };
}

export async function deleteInvestmentActivity(id: string) {
  const { error } = await supabase
    .from("investment_activities")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return { error: null };
}


