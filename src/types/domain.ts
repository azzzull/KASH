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
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
};
