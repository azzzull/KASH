export type CurrencyCode = "IDR" | string;
export type MoneyAmount = string | number;

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
  created_at: string;
  updated_at: string;
};

export type CategoryType = "income" | "expense";

export type Category = {
  id: string;
  user_id: string | null;
  name: string;
  category_type: CategoryType;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type TransactionType = "income" | "expense" | "transfer" | "adjustment";
export type TransactionStatus = "completed" | "void";

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: MoneyAmount;
  wallet_id: string;
  category_id: string | null;
  destination_wallet_id: string | null;
  transfer_fee: MoneyAmount;
  transaction_date: string;
  title: string | null;
  note: string | null;
  attachment_url: string | null;
  status: TransactionStatus;
  related_entity_type: string | null;
  related_entity_id: string | null;
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
};

export type GoalStatus = "active" | "completed" | "cancelled";

export type Goal = {
  id: string;
  user_id: string;
  wallet_id: string | null;
  name: string;
  target_amount: MoneyAmount;
  deadline: string | null;
  icon: string | null;
  image_url: string | null;
  note: string | null;
  status: GoalStatus;
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
  name: string;
  created_at: string;
  updated_at: string;
};

export type Debt = {
  id: string;
  user_id: string;
  counterparty_id: string;
  type: DebtType;
  title: string;
  original_amount: MoneyAmount;
  due_date: string | null;
  note: string | null;
  status: DebtStatus;
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
  created_at: string;
  updated_at: string;
  total_paid: MoneyAmount;
  remaining_amount: MoneyAmount;
  percentage: MoneyAmount;
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


