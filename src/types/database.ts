import type {
  Category,
  CategoryType,
  CurrencyCode,
  Goal,
  GoalContribution,
  GoalProgress,
  GoalStatus,
  Notification,
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
    };
    Enums: {
      wallet_type: Wallet["wallet_type"];
      transaction_type: Transaction["type"];
      transaction_status: Transaction["status"];
      goal_status: GoalStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
