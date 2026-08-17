import type {
  Category,
  CategoryType,
  Counterparty,
  CounterpartySummary,
  CurrencyCode,
  Debt,
  DebtPayment,
  DebtPaymentAllocation,
  DebtProgress,
  DebtStatus,
  DebtType,
  Goal,
  GoalContribution,
  GoalProgress,
  GoalStatus,
  Notification,
  PaymentMode,
  Profile,
  Transaction,
  TransactionStatus,
  TransactionType,
  Wallet,
  WalletBalance,
  WalletType,
} from "./domain";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          default_currency?: CurrencyCode;
          timezone?: string;
          locale?: string;
          onboarding_completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      wallets: {
        Row: Wallet;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          wallet_type: WalletType;
          institution_name?: string | null;
          account_reference?: string | null;
          initial_balance?: string;
          currency?: CurrencyCode;
          icon?: string | null;
          color?: string | null;
          include_in_net_worth?: boolean;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Wallet, "id" | "user_id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          category_type: CategoryType;
          icon?: string | null;
          color?: string | null;
          is_system?: boolean;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Category, "id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          user_id: string;
          type: TransactionType;
          amount: string;
          wallet_id: string;
          category_id?: string | null;
          destination_wallet_id?: string | null;
          transfer_fee?: string;
          transaction_date?: string;
          title?: string | null;
          note?: string | null;
          attachment_url?: string | null;
          status?: TransactionStatus;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Transaction, "id" | "user_id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      goals: {
        Row: Goal;
        Insert: {
          id?: string;
          user_id: string;
          wallet_id?: string | null;
          name: string;
          target_amount: string;
          deadline?: string | null;
          icon?: string | null;
          image_url?: string | null;
          note?: string | null;
          status?: GoalStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Goal, "id" | "user_id" | "created_at" | "updated_at">>;
        Relationships: [];
      };
      goal_contributions: {
        Row: GoalContribution;
        Insert: {
          id?: string;
          goal_id: string;
          user_id: string;
          wallet_id: string;
          transaction_id?: string | null;
          amount: string;
          contribution_date?: string;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<GoalContribution, "id" | "goal_id" | "user_id" | "wallet_id" | "created_at">>;
        Relationships: [];
      };
      counterparties: {
        Row: Counterparty;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Counterparty, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      debts: {
        Row: Debt;
        Insert: {
          id?: string;
          user_id: string;
          counterparty_id: string;
          type: DebtType;
          title: string;
          original_amount: string;
          due_date?: string | null;
          note?: string | null;
          status?: DebtStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Debt, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      debt_payments: {
        Row: DebtPayment;
        Insert: {
          id?: string;
          user_id: string;
          counterparty_id: string;
          debt_type: DebtType;
          payment_mode: PaymentMode;
          total_amount: string;
          payment_date?: string;
          wallet_id?: string | null;
          transaction_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<DebtPayment, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      debt_payment_allocations: {
        Row: DebtPaymentAllocation;
        Insert: {
          id?: string;
          debt_payment_id: string;
          debt_id: string;
          user_id: string;
          allocated_amount: string;
          created_at?: string;
        };
        Update: Partial<Omit<DebtPaymentAllocation, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      notifications: {
        Row: Notification;
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          message: string;
          entity_type?: string | null;
          entity_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<Omit<Notification, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: {
      wallet_balance_view: {
        Row: WalletBalance;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      goal_progress_view: {
        Row: GoalProgress;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      debt_progress_view: {
        Row: DebtProgress;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      counterparty_summary_view: {
        Row: CounterpartySummary;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      create_goal_with_pocket: {
        Args: {
          p_name: string;
          p_target_amount: string;
          p_deadline?: string | null;
          p_icon?: string | null;
          p_note?: string | null;
          p_pocket_institution?: string | null;
        };
        Returns: Goal;
      };
      create_goal_contribution: {
        Args: {
          p_goal_id: string;
          p_wallet_id: string;
          p_amount: string;
          p_contribution_date?: string;
          p_note?: string | null;
        };
        Returns: GoalContribution;
      };
      close_goal_with_sweep: {
        Args: {
          p_goal_id: string;
          p_destination_wallet_id?: string | null;
        };
        Returns: Json;
      };
      record_counterparty_settlement: {
        Args: {
          p_counterparty_id: string;
          p_debt_type: DebtType;
          p_payment_mode: PaymentMode;
          p_amount: string;
          p_wallet_id?: string | null;
          p_payment_date?: string;
          p_note?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      wallet_type: Wallet["wallet_type"];
      transaction_type: Transaction["type"];
      transaction_status: Transaction["status"];
      goal_status: GoalStatus;
      debt_type: DebtType;
      debt_status: DebtStatus;
      payment_mode: PaymentMode;
    };
    CompositeTypes: Record<string, never>;
  };
};
