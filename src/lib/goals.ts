import type { Database } from "../types/database";
import type { Goal, GoalContribution, GoalProgress, Wallet } from "../types/domain";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";

export type GoalWithProgress = Goal & {
  progress: GoalProgress | null;
};

export type GoalContributionWithWallet = GoalContribution & {
  wallet: Wallet | null;
};

export type GoalDetail = GoalWithProgress & {
  contributions: GoalContributionWithWallet[];
  wallet: Wallet | null;
};

export type CreateGoalInput = {
  name: string;
  targetAmount: string;
  deadline: string | null;
  icon: string | null;
  imageUrl?: string | null;
  note: string | null;
  pocketInstitution?: string | null;
};

export type UpdateGoalInput = CreateGoalInput;

export type CreateGoalContributionInput = {
  goalId: string;
  walletId: string;
  amount: string;
  contributionDate: string;
  note: string | null;
};

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You need to be signed in to manage goals.");
  }

  return user.id;
}

function attachProgress(goals: Goal[], progressRows: GoalProgress[]): GoalWithProgress[] {
  const progressByGoalId = new Map(progressRows.map((progress) => [progress.goal_id, progress]));

  return goals.map((goal) => ({
    ...goal,
    progress: progressByGoalId.get(goal.id) ?? null,
  }));
}

export async function getGoals(spaceId?: string) {
  const targetSpaceId = spaceId ?? getActiveSpaceId();
  let query = supabase
    .from("goals")
    .select("*")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (targetSpaceId) {
    query = query.eq("space_id", targetSpaceId);
  }

  const { data: goals, error: goalsError } = await query;

  if (goalsError || !goals) {
    return { data: null, error: goalsError };
  }

  if (goals.length === 0) {
    return { data: [] satisfies GoalWithProgress[], error: null };
  }

  const goalIds = goals.map((goal) => goal.id);
  const { data: progress, error: progressError } = await supabase
    .from("goal_progress_view")
    .select("*")
    .in("goal_id", goalIds);

  if (progressError || !progress) {
    return { data: null, error: progressError };
  }

  return { data: attachProgress(goals, progress), error: null };
}

export async function getGoalById(id: string) {
  const { data: goal, error: goalError } = await supabase.from("goals").select("*").eq("id", id).single();

  if (goalError || !goal) {
    return { data: null, error: goalError };
  }

  const [{ data: progress, error: progressError }, { data: contributions, error: contributionError }] = await Promise.all([
    supabase.from("goal_progress_view").select("*").eq("goal_id", id).maybeSingle(),
    supabase
      .from("goal_contributions")
      .select("*")
      .eq("goal_id", id)
      .order("contribution_date", { ascending: false }),
  ]);

  if (progressError) {
    return { data: null, error: progressError };
  }

  if (contributionError || !contributions) {
    return { data: null, error: contributionError };
  }

  const walletIds = Array.from(
    new Set([goal.wallet_id, ...contributions.map((contribution) => contribution.wallet_id)].filter((walletId): walletId is string => Boolean(walletId))),
  );
  const walletsById = new Map<string, Wallet>();

  if (walletIds.length > 0) {
    const { data: wallets, error: walletError } = await supabase.from("wallets").select("*").in("id", walletIds);

    if (walletError || !wallets) {
      return { data: null, error: walletError };
    }

    wallets.forEach((wallet) => walletsById.set(wallet.id, wallet));
  }

  const detail: GoalDetail = {
    ...goal,
    progress,
    contributions: contributions.map((contribution) => ({
      ...contribution,
      wallet: walletsById.get(contribution.wallet_id) ?? null,
    })),
    wallet: goal.wallet_id ? walletsById.get(goal.wallet_id) ?? null : null,
  };

  return { data: detail, error: null };
}

export async function createGoal(input: CreateGoalInput) {
  await getAuthenticatedUserId();

  return supabase.rpc("create_goal_with_pocket", {
    p_deadline: input.deadline?.trim() || null,
    p_icon: input.icon,
    p_name: input.name,
    p_note: input.note,
    p_pocket_institution: input.pocketInstitution,
    p_target_amount: input.targetAmount,
  });
}

export async function updateGoal(id: string, input: UpdateGoalInput) {
  const updatePayload: Database["public"]["Tables"]["goals"]["Update"] = {
    name: input.name,
    target_amount: input.targetAmount,
    deadline: input.deadline?.trim() || null,
    icon: input.icon,
    image_url: input.imageUrl ?? null,
    note: input.note,
  };

  const result = await supabase.from("goals").update(updatePayload).eq("id", id).select("*").single();

  if (!result.error && result.data.wallet_id) {
    const walletUpdate: Database["public"]["Tables"]["wallets"]["Update"] = {
      icon: input.icon,
      name: `${input.name} Pocket`,
    };

    await supabase.from("wallets").update(walletUpdate).eq("id", result.data.wallet_id);
  }

  return result;
}

export async function archiveGoal(id: string) {
  return supabase.from("goals").update({ status: "cancelled" }).eq("id", id).select("*").single();
}

export async function closeGoal(goalId: string, destinationWalletId?: string | null) {
  return supabase.rpc("close_goal_with_sweep", {
    p_destination_wallet_id: destinationWalletId || null,
    p_goal_id: goalId,
  });
}

export async function createGoalContribution(input: CreateGoalContributionInput) {
  return supabase.rpc("create_goal_contribution", {
    p_goal_id: input.goalId,
    p_wallet_id: input.walletId,
    p_amount: input.amount,
    p_contribution_date: input.contributionDate,
    p_note: input.note,
  });
}

