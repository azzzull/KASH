export type CurrencyCode = "IDR" | string;
export type MoneyAmount = string | number;

export type FinancialSpaceType = "personal" | "managed";

export type FinancialSpace = {
  id: string;
  owner_user_id: string;
  name: string;
  space_type: FinancialSpaceType;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ManagedSpaceRole = "owner" | "admin" | "member" | "viewer";
export type ManagedSpaceMemberStatus = "invited" | "active";

export type ManagedSpaceMember = {
  id: string;
  space_id: string;
  user_id: string;
  role: ManagedSpaceRole;
  status: ManagedSpaceMemberStatus;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagedSpaceMemberItem = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: ManagedSpaceRole;
  status: string;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  default_currency: CurrencyCode;
  timezone: string;
  locale: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type WalletType = "bank" | "digital_bank" | "ewallet" | "cash" | "investment" | "savings" | "custom";

export type Wallet = {
  id: string;
  user_id: string;
  space_id?: string;
  name: string;
  wallet_type: WalletType;
  institution_name: string | null;
  account_reference: string | null;
  initial_balance: MoneyAmount;
  currency: CurrencyCode;
  icon: string | null;
  color: string | null;
  include_in_net_worth: boolean;
  is_archived: boolean;
  cost_basis?: MoneyAmount | null;
  current_market_value?: MoneyAmount | null;
  last_valuation_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CategoryType = "income" | "expense";

export type Category = {
  id: string;
  user_id: string | null;
  space_id?: string | null;
  name: string;
  category_type: CategoryType;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Envelope = {
  id: string;
  user_id: string;
  space_id?: string;
  name: string;
  icon: string | null;
  color: string | null;
  target_amount: MoneyAmount | null;
  is_archived: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentActivityType = "realized_gain" | "realized_loss";

export type InvestmentActivity = {
  id: string;
  user_id: string;
  wallet_id: string;
  activity_type: InvestmentActivityType;
  amount: MoneyAmount;
  activity_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentValuation = {
  id: string;
  user_id: string;
  wallet_id: string;
  market_value: MoneyAmount;
  cost_basis_at_valuation: MoneyAmount;
  unrealized_gain_loss?: MoneyAmount;
  valuation_date: string;
  note: string | null;
  created_at: string;
};

export type TransactionType = "income" | "expense" | "transfer" | "adjustment";
export type TransactionStatus = "completed" | "void";

export type Transaction = {
  id: string;
  user_id: string;
  space_id?: string;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
  type: TransactionType;
  amount: MoneyAmount;
  wallet_id: string | null;
  category_id: string | null;
  envelope_id: string | null;
  destination_wallet_id: string | null;
  transfer_fee?: MoneyAmount | null;
  transaction_date: string;
  title: string | null;
  note: string | null;
  attachment_url: string | null;
  status: TransactionStatus;
  related_entity_type: string | null;
  related_entity_id: string | null;
  cross_space_event_id?: string | null;
  cross_space_role?: "personal_cash_out" | "managed_spending" | "managed_advance_cash_in" | null;
  created_at: string;
  updated_at: string;
};

export type WalletBalance = {
  wallet_id: string;
  user_id: string;
  initial_balance: MoneyAmount;
  transaction_total: MoneyAmount;
  current_balance: MoneyAmount;
  allocated_to_goals: MoneyAmount;
  available_balance: MoneyAmount;
  net_contributions?: MoneyAmount | null;
  cost_basis?: MoneyAmount | null;
  realized_pnl?: MoneyAmount | null;
  total_pnl?: MoneyAmount | null;
  unrealized_pnl?: MoneyAmount | null;
  unrealized_gain_loss?: MoneyAmount | null;
  return_percentage?: number | null;
  last_valuation_at?: string | null;
};

export type GoalStatus = "active" | "completed" | "cancelled";

export type Goal = {
  id: string;
  user_id: string;
  space_id?: string;
  wallet_id: string | null;
  name: string;
  target_amount: MoneyAmount;
  deadline: string | null;
  icon: string | null;
  image_url: string | null;
  note: string | null;
  status: GoalStatus;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type GoalContribution = {
  id: string;
  goal_id: string;
  user_id: string;
  wallet_id: string;
  transaction_id: string | null;
  amount: MoneyAmount;
  contribution_date: string;
  note: string | null;
  created_at: string;
};

export type GoalProgress = {
  goal_id: string;
  user_id: string;
  target_amount: MoneyAmount;
  current_amount: MoneyAmount;
  remaining_amount: MoneyAmount;
  percentage: MoneyAmount;
};

export type NotificationType =
  | "debt_due_soon"
  | "debt_due_today"
  | "debt_overdue"
  | "receivable_due_soon"
  | "receivable_due_today"
  | "receivable_overdue"
  | "goal_completed"
  | "goal_milestone"
  | "subscription_due_soon"
  | "subscription_due_today"
  | "subscription_overdue"
  | "installment_due_soon"
  | "installment_due_today"
  | "installment_overdue"
  | "shared_invitation"
  | "shared_contribution_pending"
  | "shared_contribution_verified"
  | "shared_contribution_rejected"
  | (string & {});

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export type DebtType = "debt" | "receivable";
export type DebtStatus = "active" | "partially_paid" | "settled" | "cancelled";
export type PaymentMode = "wallet" | "historical";

export type Counterparty = {
  id: string;
  user_id: string;
  space_id?: string;
  name: string;
  linked_space_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type Debt = {
  id: string;
  user_id: string;
  space_id?: string;
  counterparty_id: string;
  type: DebtType;
  title: string;
  original_amount: MoneyAmount;
  due_date: string | null;
  note: string | null;
  status: DebtStatus;
  category_id?: string | null;
  cross_space_event_id?: string | null;
  cross_space_role?: "personal_receivable" | "managed_payable" | null;
  created_at: string;
  updated_at: string;
};

export type DebtPayment = {
  id: string;
  user_id: string;
  counterparty_id: string;
  debt_type: DebtType;
  payment_mode: PaymentMode;
  total_amount: MoneyAmount;
  payment_date: string;
  wallet_id: string | null;
  transaction_id: string | null;
  note: string | null;
  cross_space_settlement_id?: string | null;
  cross_space_role?: "personal_receivable_collection" | "managed_payable_payment" | null;
  created_at: string;
};

export type DebtPaymentAllocation = {
  id: string;
  debt_payment_id: string;
  debt_id: string;
  user_id: string;
  allocated_amount: MoneyAmount;
  created_at: string;
};

export type DebtProgress = {
  debt_id: string;
  user_id: string;
  counterparty_id: string;
  counterparty_name: string;
  type: DebtType;
  title: string;
  original_amount: MoneyAmount;
  due_date: string | null;
  note: string | null;
  status: DebtStatus;
  category_id?: string | null;
  created_at: string;
  updated_at: string;
  total_paid: MoneyAmount;
  remaining_amount: MoneyAmount;
  percentage: MoneyAmount;
  cross_space_event_id?: string | null;
  cross_space_role?: "personal_receivable" | "managed_payable" | null;
};

export type CounterpartySummary = {
  counterparty_id: string;
  user_id: string;
  counterparty_name: string;
  debt_type: DebtType | null;
  total_original: MoneyAmount;
  total_paid: MoneyAmount;
  remaining_amount: MoneyAmount;
  active_item_count: number;
  settled_item_count: number;
  total_item_count: number;
  created_at: string;
  updated_at: string;
};

export type RecurringObligationType = "subscription" | "bill" | "paylater" | "installment";
export type RecurringFrequency = "monthly" | "yearly" | "weekly" | "quarterly";
export type RecurringObligationStatus = "active" | "paused" | "cancelled" | "completed";
export type RecurringPaymentStatus = "pending" | "paid" | "overdue" | "skipped";

export type RecurringObligation = {
  id: string;
  user_id: string;
  space_id?: string;
  type: RecurringObligationType;
  name: string;
  provider: string | null;
  amount: MoneyAmount;
  category_id: string | null;
  frequency: RecurringFrequency;
  billing_day: number | null;
  start_date: string;
  end_date: string | null;
  next_due_date: string | null;
  status: RecurringObligationStatus;
  default_wallet_id: string | null;
  reminder_offsets: number[];
  overdue_reminder_enabled: boolean;
  installment_total_amount: MoneyAmount | null;
  installment_count: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringPayment = {
  id: string;
  user_id: string;
  obligation_id: string;
  due_date: string;
  amount: MoneyAmount;
  status: RecurringPaymentStatus;
  paid_at: string | null;
  payment_mode: PaymentMode | null;
  wallet_id: string | null;
  transaction_id: string | null;
  installment_number: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringObligationSummary = RecurringObligation & {
  paid_count: number;
  remaining_count: number;
  total_paid_amount: MoneyAmount;
  remaining_amount: MoneyAmount;
  progress_percentage: MoneyAmount;
};

export type PushSubscriptionRecord = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_label: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

export type BudgetType = "category" | "envelope";
export type BudgetTargetType = "category" | "envelope" | "debt" | "goal";
export type BudgetStatus = "healthy" | "near_limit" | "over_budget";

export type Budget = {
  id: string;
  user_id: string;
  space_id?: string;
  name: string;
  type: BudgetType;
  target_type: BudgetTargetType;
  category_id: string | null;
  envelope_id: string | null;
  counterparty_id: string | null;
  debt_id: string | null;
  goal_id: string | null;
  wallet_id: string | null;
  start_period: string; // YYYY-MM-DD (1st of month)
  end_period: string | null;
  repeat_monthly: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type BudgetVersion = {
  id: string;
  budget_id: string;
  user_id: string;
  effective_from_period: string;
  amount: MoneyAmount;
  rollover_enabled: boolean;
  created_at: string;
};

export type BudgetEnvelopeCategory = {
  id: string;
  envelope_id: string;
  category_id: string;
  effective_from_period: string;
  effective_to_period: string | null;
  created_at: string;
};

export type BudgetWithProgress = {
  budget_id: string;
  name: string;
  type: BudgetType;
  target_type: BudgetTargetType;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  envelope_id: string | null;
  envelope_name: string | null;
  envelope_icon: string | null;
  envelope_color: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  debt_id: string | null;
  debt_title: string | null;
  goal_id: string | null;
  goal_name: string | null;
  goal_icon: string | null;
  wallet_id: string | null;
  wallet_name: string | null;
  wallet_icon: string | null;
  wallet_color: string | null;
  note: string | null;
  repeat_monthly: boolean;
  start_period: string;
  end_period: string | null;
  base_amount: MoneyAmount;
  rollover_enabled: boolean;
  rollover_amount: MoneyAmount;
  effective_budget: MoneyAmount;
  spent: MoneyAmount;
  remaining: MoneyAmount;
  usage_percentage: number;
  status: BudgetStatus;
  included_category_ids: string[];
  included_category_names: string[];
};

export type MonthlyBudgetOverview = {
  period_start: string;
  total_allocated: MoneyAmount;
  total_category_budget: MoneyAmount;
  total_envelope_budget: MoneyAmount;
  total_debt_budget: MoneyAmount;
  total_goal_budget: MoneyAmount;
  actual_expenses: MoneyAmount;
  actual_debt_payments: MoneyAmount;
  actual_goal_contributions: MoneyAmount;
  total_actual_cash_outflow: MoneyAmount;
  total_economic_realization: MoneyAmount;
  remaining_allocation: MoneyAmount;
  overall_usage_percentage: number;
  budget_count: number;
  healthy_count: number;
  near_limit_count: number;
  over_budget_count: number;
  // Compatibility aliases
  total_budget?: MoneyAmount;
  total_spent?: MoneyAmount;
  total_remaining?: MoneyAmount;
  total_budgets_count?: number;
};

// ============================================================
// SHARED SAVINGS (TABUNGAN BERSAMA) DOMAIN TYPES
// ============================================================

export type SharedSavingsStatus = "active" | "closed" | "archived";
export type SharedSavingsMemberStatus = "active" | "left" | "removed";
export type SharedSavingsInviteStatus = "pending" | "accepted" | "rejected" | "expired" | "cancelled";
export type SharedSavingsRequestType = "contribution" | "withdrawal" | "shared_spending";
export type SharedSavingsRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type SharedSavingsEventType = "contribution" | "personal_withdrawal" | "shared_spending" | "reversal";

export type SharedSavings = {
  id: string;
  owner_user_id: string;
  name: string;
  target_amount: MoneyAmount | null;
  deadline: string | null;
  account_holder_user_id: string;
  status: SharedSavingsStatus;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type SharedSavingsMember = {
  id: string;
  shared_savings_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  status: SharedSavingsMemberStatus;
  created_at: string;
  updated_at: string;
};

export type SharedSavingsApprover = {
  id: string;
  shared_savings_id: string;
  user_id: string;
  created_at: string;
};

export type SharedSavingsInvite = {
  id: string;
  shared_savings_id: string;
  inviter_user_id: string;
  invited_user_id: string | null;
  invited_email: string;
  status: SharedSavingsInviteStatus;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  responded_at: string | null;
  shared_savings?: SharedSavings | null;
  inviter_name?: string | null;
  inviter_email?: string | null;
  inviter_avatar_url?: string | null;
  owner_name?: string | null;
};

export type SharedSavingsRequest = {
  id: string;
  shared_savings_id: string;
  request_type: SharedSavingsRequestType;
  requested_by_user_id: string;
  amount: MoneyAmount;
  source_wallet_id: string | null;
  destination_wallet_id: string | null;
  title: string | null;
  note: string | null;
  status: SharedSavingsRequestStatus;
  approved_by_user_id: string | null;
  approved_at: string | null;
  rejected_by_user_id: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
  requester_name?: string | null;
  requester_email?: string | null;
  requester_avatar_url?: string | null;
  source_wallet_name?: string | null;
  destination_wallet_name?: string | null;
};

export type SharedSavingsLedger = {
  id: string;
  shared_savings_id: string;
  request_id: string;
  event_type: SharedSavingsEventType;
  amount: MoneyAmount;
  title: string | null;
  note: string | null;
  created_at: string;
  requester_name?: string | null;
  requester_user_id?: string | null;
  requester_avatar_url?: string | null;
};

export type SharedSavingsMemberAllocation = {
  id: string;
  shared_savings_id: string;
  ledger_id: string;
  user_id: string;
  amount_signed: MoneyAmount;
  created_at: string;
};

export type SharedSavingsBalance = {
  shared_savings_id: string;
  owner_user_id: string;
  name: string;
  target_amount: MoneyAmount | null;
  deadline: string | null;
  account_holder_user_id: string;
  status: SharedSavingsStatus;
  icon: string;
  color: string;
  created_at: string;
  current_balance: MoneyAmount;
  total_contributions: MoneyAmount;
  total_withdrawals: MoneyAmount;
  total_spending: MoneyAmount;
  active_members_count: number;
};

export type SharedSavingsMemberShare = {
  shared_savings_id: string;
  user_id: string;
  member_status: SharedSavingsMemberStatus;
  joined_at: string;
  left_at: string | null;
  member_name: string | null;
  member_email: string;
  member_avatar_url: string | null;
  current_share: MoneyAmount;
  total_contributed: MoneyAmount;
  total_withdrawn: MoneyAmount;
  total_spent_allocated: MoneyAmount;
  is_owner?: boolean;
  is_account_holder?: boolean;
  is_approver?: boolean;
};

export type SharedSavingsSpaceSummary = {
  space: SharedSavingsBalance;
  myShare: MoneyAmount;
  isOwner: boolean;
  isAccountHolder: boolean;
  isApprover: boolean;
  pendingRequestsCount: number;
  ownerName: string;
  accountHolderName: string;
};

export type CrossSpaceEventType =
  | "managed_expense_paid_personally"
  | "personal_advance_to_managed";

export type CrossSpaceTxRole =
  | "personal_cash_out"
  | "managed_spending"
  | "managed_advance_cash_in";

export type CrossSpaceDebtRole =
  | "personal_receivable"
  | "managed_payable";

export type CrossSpacePaymentRole =
  | "personal_receivable_collection"
  | "managed_payable_payment";

export type CrossSpaceEvent = {
  id: string;
  user_id: string;
  event_type: CrossSpaceEventType;
  personal_space_id: string;
  managed_space_id: string;
  amount: MoneyAmount;
  managed_category_id?: string | null;
  event_date: string;
  title?: string | null;
  note?: string | null;
  status: string;
  client_request_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type CrossSpaceSettlement = {
  id: string;
  user_id: string;
  event_id: string;
  amount: MoneyAmount;
  managed_wallet_id: string;
  personal_wallet_id: string;
  settlement_date: string;
  status: string;
  client_request_id?: string | null;
  created_at: string;
};

