import type { CurrencyCode, Wallet, WalletBalance, WalletType } from "../types/domain";
import type { Database } from "../types/database";
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

function attachBalances(wallets: Wallet[], balances: WalletBalance[]) {
  return wallets.map((wallet) => ({
    ...wallet,
    balance: balances.find((balance) => balance.wallet_id === wallet.id) ?? null,
  }));
}

export async function getWallets() {
  const { data: wallets, error: walletError } = await supabase
    .from("wallets")
    .select("*")
    .eq("is_archived", false)
    .order("created_at", { ascending: true });

  if (walletError || !wallets) {
    return { data: null, error: walletError };
  }

  const { data: balances, error: balanceError } = await supabase.from("wallet_balance_view").select("*");

  if (balanceError || !balances) {
    return { data: null, error: balanceError };
  }

  return { data: attachBalances(wallets, balances), error: null };
}

export async function getWalletById(id: string) {
  const { data: wallet, error: walletError } = await supabase.from("wallets").select("*").eq("id", id).single();

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

  return { data: { ...wallet, balance }, error: null };
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

export async function createWallet(input: CreateWalletInput) {
  const userId = await getAuthenticatedUserId();

  return supabase
    .from("wallets")
    .insert({
      user_id: userId,
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

export async function createFirstWallet(input: CreateFirstWalletInput) {
  return createWallet(input);
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

export async function deleteWallet(id: string) {
  return supabase.from("wallets").delete().eq("id", id).select("*").single();
}
