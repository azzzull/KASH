import type {
  Budget,
  BudgetEnvelopeCategory,
  BudgetStatus,
  BudgetTargetType,
  BudgetType,
  BudgetVersion,
  BudgetWithProgress,
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
  Envelope,
  FinancialSpace,
  FinancialSpaceType,
  Goal,
  GoalContribution,
  GoalProgress,
  GoalStatus,
  InvestmentActivity,
  InvestmentActivityType,
  InvestmentValuation,
  MonthlyBudgetOverview,
  Notification,
  PaymentMode,
  Profile,
  PushSubscriptionRecord,
  RecurringFrequency,
  RecurringObligation,
  RecurringObligationStatus,
  RecurringObligationSummary,
  RecurringObligationType,
  RecurringPayment,
  RecurringPaymentStatus,
  Transaction,
  TransactionStatus,
  TransactionType,
  Wallet,
  WalletBalance,
  WalletType,
  SharedSavings,
  SharedSavingsMember,
  SharedSavingsApprover,
  SharedSavingsInvite,
  SharedSavingsRequest,
  SharedSavingsLedger,
  SharedSavingsMemberAllocation,
  SharedSavingsBalance,
  SharedSavingsMemberShare,
} from "./domain";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      financial_spaces: {
        Row: FinancialSpace;
        Insert: {
          id?: string;
          owner_user_id: string;
          name: string;
          space_type: FinancialSpaceType;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<FinancialSpace, "id" | "owner_user_id" | "created_at">>;
        Relationships: [];
      };
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
          space_id?: string;
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
          cost_basis?: string | null;
          current_market_value?: string | null;
          last_valuation_at?: string | null;
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
          space_id?: string | null;
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
      envelopes: {
        Row: Envelope;
        Insert: {
          id?: string;
          user_id: string;
          space_id?: string;
          name: string;
          icon?: string | null;
          color?: string | null;
          target_amount?: string | null;
          is_archived?: boolean;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Envelope, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      investment_valuations: {
        Row: InvestmentValuation;
        Insert: {
          id?: string;
          user_id: string;
          wallet_id: string;
          market_value: string;
          cost_basis_at_valuation: string;
          valuation_date?: string;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<InvestmentValuation, "id" | "user_id" | "wallet_id" | "created_at">>;
        Relationships: [];
      };
      investment_activities: {
        Row: InvestmentActivity;
        Insert: {
          id?: string;
          user_id?: string;
          wallet_id: string;
          activity_type: InvestmentActivityType;
          amount: number | string;
          activity_date?: string;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InvestmentActivity, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          user_id: string;
          space_id?: string;
          type: TransactionType;
          amount: string;
          wallet_id: string;
          category_id?: string | null;
          envelope_id?: string | null;
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
          space_id?: string;
          wallet_id?: string | null;
          name: string;
          target_amount: string;
          deadline?: string | null;
          icon?: string | null;
          image_url?: string | null;
          note?: string | null;
          status?: GoalStatus;
            is_archived?: boolean;
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
          space_id?: string;
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
          space_id?: string;
          counterparty_id: string;
          type: DebtType;
          title: string;
          original_amount: string;
          due_date?: string | null;
          note?: string | null;
          status?: DebtStatus;
          category_id?: string | null;
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
          metadata?: Json;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<Notification, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      recurring_obligations: {
        Row: RecurringObligation;
        Insert: {
          id?: string;
          user_id: string;
          space_id?: string;
          type: RecurringObligationType;
          name: string;
          provider?: string | null;
          amount: string;
          category_id?: string | null;
          frequency?: RecurringFrequency;
          billing_day?: number | null;
          start_date: string;
          end_date?: string | null;
          next_due_date?: string | null;
          status?: RecurringObligationStatus;
          default_wallet_id?: string | null;
          reminder_offsets?: number[];
          overdue_reminder_enabled?: boolean;
          installment_total_amount?: string | null;
          installment_count?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<RecurringObligation, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      recurring_payments: {
        Row: RecurringPayment;
        Insert: {
          id?: string;
          user_id: string;
          obligation_id: string;
          due_date: string;
          amount: string;
          status?: RecurringPaymentStatus;
          paid_at?: string | null;
          payment_mode?: PaymentMode | null;
          wallet_id?: string | null;
          transaction_id?: string | null;
          installment_number?: number | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<RecurringPayment, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRecord;
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          device_label?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          last_used_at?: string | null;
        };
        Update: Partial<Omit<PushSubscriptionRecord, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      notification_reminder_logs: {
        Row: {
          id: string;
          user_id: string;
          obligation_id: string;
          payment_id: string;
          reminder_offset: number;
          due_date: string;
          notification_id: string | null;
          sent_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          obligation_id: string;
          payment_id: string;
          reminder_offset: number;
          due_date: string;
          notification_id?: string | null;
          sent_at?: string;
        };
        Update: Partial<{
          notification_id?: string | null;
        }>;
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
      recurring_obligations_summary_view: {
        Row: RecurringObligationSummary;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      budgets: {
        Row: Budget;
        Insert: Omit<Budget, "created_at" | "updated_at"> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Budget, "id" | "user_id">>;
        Relationships: [];
      };
      budget_versions: {
        Row: BudgetVersion;
        Insert: Omit<BudgetVersion, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<BudgetVersion, "id" | "budget_id">>;
        Relationships: [];
      };
      budget_envelope_categories: {
        Row: BudgetEnvelopeCategory;
        Insert: Omit<BudgetEnvelopeCategory, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<BudgetEnvelopeCategory, "id" | "budget_id">>;
        Relationships: [];
      };
      shared_savings: {
        Row: SharedSavings;
        Insert: Partial<SharedSavings>;
        Update: Partial<SharedSavings>;
        Relationships: [];
      };
      shared_savings_members: {
        Row: SharedSavingsMember;
        Insert: Partial<SharedSavingsMember>;
        Update: Partial<SharedSavingsMember>;
        Relationships: [];
      };
      shared_savings_approvers: {
        Row: SharedSavingsApprover;
        Insert: Partial<SharedSavingsApprover>;
        Update: Partial<SharedSavingsApprover>;
        Relationships: [];
      };
      shared_savings_invites: {
        Row: SharedSavingsInvite;
        Insert: Partial<SharedSavingsInvite>;
        Update: Partial<SharedSavingsInvite>;
        Relationships: [];
      };
      shared_savings_requests: {
        Row: SharedSavingsRequest;
        Insert: Partial<SharedSavingsRequest>;
        Update: Partial<SharedSavingsRequest>;
        Relationships: [];
      };
      shared_savings_ledger: {
        Row: SharedSavingsLedger;
        Insert: Partial<SharedSavingsLedger>;
        Update: Partial<SharedSavingsLedger>;
        Relationships: [];
      };
      shared_savings_member_allocations: {
        Row: SharedSavingsMemberAllocation;
        Insert: Partial<SharedSavingsMemberAllocation>;
        Update: Partial<SharedSavingsMemberAllocation>;
        Relationships: [];
      };
      shared_savings_notification_logs: {
        Row: {
          id: string;
          shared_savings_id: string;
          event_type: string;
          reference_value: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          shared_savings_id: string;
          event_type: string;
          reference_value: string;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          shared_savings_id: string;
          event_type: string;
          reference_value: string;
          created_at: string;
        }>;
        Relationships: [];
      };
      shared_savings_balance_view: {
        Row: SharedSavingsBalance;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      shared_savings_member_shares_view: {
        Row: SharedSavingsMemberShare;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      delete_wallet_permanently: {
        Args: {
          p_wallet_id: string;
        };
        Returns: void;
      };
      delete_goal_if_empty: {
        Args: {
          p_goal_id: string;
        };
        Returns: void;
      };
      update_investment_valuation: {
        Args: {
          p_wallet_id: string;
          p_market_value: number;
          p_valuation_date?: string;
          p_note?: string | null;
        };
        Returns: Json;
      };
      create_budget_target: {
        Args: {
          p_name: string;
          p_target_type: BudgetTargetType;
          p_amount: number;
          p_start_period?: string;
          p_repeat_monthly?: boolean;
          p_rollover_enabled?: boolean;
          p_category_id?: string | null;
          p_envelope_id?: string | null;
          p_debt_id?: string | null;
          p_goal_id?: string | null;
          p_wallet_id?: string | null;
          p_note?: string | null;
          p_space_id?: string | null;
        };
        Returns: string;
      };
      get_monthly_budget_progress: {
        Args: {
          p_period_start?: string | null;
          p_space_id?: string | null;
        };
        Returns: {
          budget_id: string;
          name: string;
          type: BudgetType;
          target_type?: BudgetTargetType;
          category_id: string | null;
          category_name: string | null;
          category_icon: string | null;
          category_color: string | null;
          envelope_id: string | null;
          envelope_name: string | null;
          counterparty_id: string | null;
          counterparty_name: string | null;
          debt_id: string | null;
          debt_title: string | null;
          goal_id: string | null;
          goal_name: string | null;
          note: string | null;
          repeat_monthly: boolean;
          start_period: string;
          end_period: string | null;
          base_amount: number;
          rollover_enabled: boolean;
          rollover_amount: number;
          effective_budget: number;
          spent: number;
          remaining: number;
          usage_percentage: number;
          status: BudgetStatus;
          included_category_ids: string[];
          included_category_names: string[];
        }[];
      };
      get_monthly_budget_overview: {
        Args: {
          p_period_start?: string | null;
          p_space_id?: string | null;
        };
        Returns: {
          period_start: string;
          total_allocated: number;
          total_actual_cash_outflow: number;
          total_budget: number;
          total_spent: number;
          total_remaining: number;
          actual_expenses: number;
          actual_debt_payments: number;
          actual_goal_contributions: number;
          remaining_allocation: number;
          overall_usage_percentage: number;
          total_budgets_count: number;
          healthy_count: number;
          near_limit_count: number;
          over_budget_count: number;
        }[];
      };
      create_category_budget: {
        Args: {
          p_name: string;
          p_category_id: string;
          p_amount: number;
          p_start_period?: string;
          p_repeat_monthly?: boolean;
          p_rollover_enabled?: boolean;
          p_note?: string | null;
        };
        Returns: string;
      };
      create_envelope_budget: {
        Args: {
          p_name: string;
          p_category_ids: string[];
          p_amount: number;
          p_start_period?: string;
          p_repeat_monthly?: boolean;
          p_rollover_enabled?: boolean;
          p_note?: string | null;
        };
        Returns: string;
      };
      update_budget: {
        Args: {
          p_budget_id: string;
          p_name?: string | null;
          p_note?: string | null;
          p_effective_period?: string | null;
          p_amount?: number | null;
          p_rollover_enabled?: boolean | null;
          p_category_ids?: string[] | null;
        };
        Returns: boolean;
      };
      archive_budget: {
        Args: {
          p_budget_id: string;
          p_end_period: string;
        };
        Returns: boolean;
      };
      delete_budget: {
        Args: {
          p_budget_id: string;
        };
        Returns: boolean;
      };
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
          p_amount: string | number;
          p_wallet_id?: string | null;
          p_payment_date?: string;
          p_note?: string | null;
          p_debt_id?: string | null;
        };
        Returns: Json;
      };
      mark_notification_read: {
        Args: {
          p_notification_id: string;
        };
        Returns: void;
      };
      mark_all_notifications_read: {
        Args: Record<string, never>;
        Returns: void;
      };
      clear_read_notifications: {
        Args: Record<string, never>;
        Returns: number;
      };
      create_recurring_obligation: {
        Args: {
          p_type: RecurringObligationType;
          p_name: string;
          p_amount: string;
          p_start_date: string;
          p_frequency?: RecurringFrequency;
          p_provider?: string | null;
          p_category_id?: string | null;
          p_default_wallet_id?: string | null;
          p_reminder_offsets?: number[];
          p_overdue_reminder_enabled?: boolean;
          p_installment_total_amount?: string | null;
          p_installment_count?: number | null;
          p_already_paid_count?: number;
          p_note?: string | null;
        };
        Returns: string;
      };
      record_recurring_payment: {
        Args: {
          p_payment_id: string;
          p_payment_mode: PaymentMode;
          p_wallet_id?: string | null;
          p_paid_at?: string;
          p_note?: string | null;
        };
        Returns: Json;
      };
      settle_remaining_installment: {
        Args: {
          p_obligation_id: string;
          p_payment_mode: PaymentMode;
          p_wallet_id?: string | null;
          p_paid_at?: string;
          p_note?: string | null;
        };
        Returns: Json;
      };
      cancel_recurring_obligation: {
        Args: {
          p_obligation_id: string;
        };
        Returns: void;
      };
      upsert_push_subscription: {
        Args: {
          p_endpoint: string;
          p_p256dh: string;
          p_auth: string;
          p_user_agent?: string | null;
          p_device_label?: string | null;
        };
        Returns: void;
      };
      process_recurring_reminders: {
        Args: {
          p_current_date?: string;
        };
        Returns: {
          notification_id: string;
          user_id: string;
          title: string;
          message: string;
          target_path: string;
        }[];
      };
      create_shared_savings: {
        Args: {
          p_name: string;
          p_target_amount?: number | null;
          p_deadline?: string | null;
          p_icon?: string;
          p_color?: string;
        };
        Returns: string;
      };
      invite_shared_savings_member: {
        Args: {
          p_shared_savings_id: string;
          p_email: string;
        };
        Returns: string;
      };
      respond_shared_savings_invite: {
        Args: {
          p_invite_id: string;
          p_action: "accept" | "reject";
        };
        Returns: boolean;
      };
      submit_shared_contribution_request: {
        Args: {
          p_shared_savings_id: string;
          p_source_wallet_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: string;
      };
      submit_shared_withdrawal_request: {
        Args: {
          p_shared_savings_id: string;
          p_destination_wallet_id: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: string;
      };
      submit_shared_spending_request: {
        Args: {
          p_shared_savings_id: string;
          p_title: string;
          p_amount: number;
          p_note?: string | null;
        };
        Returns: string;
      };
      approve_shared_contribution: {
        Args: {
          p_request_id: string;
        };
        Returns: boolean;
      };
      approve_shared_withdrawal: {
        Args: {
          p_request_id: string;
        };
        Returns: boolean;
      };
      approve_shared_spending: {
        Args: {
          p_request_id: string;
        };
        Returns: boolean;
      };
      reject_shared_request: {
        Args: {
          p_request_id: string;
          p_reason?: string | null;
        };
        Returns: boolean;
      };
      cancel_shared_request: {
        Args: {
          p_request_id: string;
        };
        Returns: boolean;
      };
      update_shared_savings_settings: {
        Args: {
          p_shared_savings_id: string;
          p_name: string;
          p_target_amount?: number | null;
          p_deadline?: string | null;
          p_icon?: string | null;
          p_color?: string | null;
        };
        Returns: boolean;
      };
      transfer_shared_savings_ownership: {
        Args: {
          p_shared_savings_id: string;
          p_new_owner_user_id: string;
        };
        Returns: boolean;
      };
      set_shared_savings_account_holder: {
        Args: {
          p_shared_savings_id: string;
          p_new_account_holder_user_id: string;
        };
        Returns: boolean;
      };
      set_shared_savings_approver: {
        Args: {
          p_shared_savings_id: string;
          p_user_id: string;
          p_is_approver: boolean;
        };
        Returns: boolean;
      };
      archive_goal: {
          Args: {
            p_goal_id: string;
          };
          Returns: undefined;
        };
        unarchive_goal: {
          Args: {
            p_goal_id: string;
          };
          Returns: undefined;
        };

        remove_shared_savings_member: {
        Args: {
          p_shared_savings_id: string;
          p_user_id: string;
        };
        Returns: boolean;
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
      recurring_obligation_type: RecurringObligationType;
      recurring_frequency: RecurringFrequency;
      recurring_obligation_status: RecurringObligationStatus;
      recurring_payment_status: RecurringPaymentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
