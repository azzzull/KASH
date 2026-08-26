import { useMemo } from "react";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useI18n, type TranslationKey } from "../i18n";

export type SpaceTerminology = {
  isManaged: boolean;
  spaceType: "personal" | "managed";
  // Balances & Cash Flow
  balanceLabel: string;
  incomeLabel: string;
  expenseLabel: string;
  netCashFlowLabel: string;
  monthlyIncomeLabel: string;
  monthlyExpenseLabel: string;
  addIncomeLabel: string;
  addExpenseLabel: string;
  saveIncomeLabel: string;
  saveExpenseLabel: string;
  newIncomeTitle: string;
  newExpenseTitle: string;
  incomeCategoryLabel: string;
  expenseCategoryLabel: string;
  dashboardOverviewTitle: string;
  cashflowTitle: string;
  spendingByCategoryTitle: string;
  totalExpenseLabel: string;
  noCashflowDesc: string;
  noSpendingDesc: string;
  noTransactionsDesc: string;
  // Analytics
  analyticsDescription: string;
  averageIncomeLabel: string;
  incomeByCategoryLabel: string;
  balanceTrendTitle: string;
  noBalanceTrendTitle: string;
  noBalanceTrendDesc: string;
  surplusRatioTitle: string;
  noIncomeYetTitle: string;
  surplusRateUnavailableDesc: string;
  analyticsFooterNote: string;
  // Calendar
  calendarDescription: string;
  // Budget
  budgetSubtitle: string;
  budgetEmptyDesc: string;
  budgetOverviewDesc: string;
  budgetGoalTabLabel: string;
  // Goals
  goalsSubtitle: string;
  goalsEmptyDesc: string;
  goalsAddContribution: string;
  goalsContributionHistory: string;
  goalsNoContributionsDesc: string;
  goalsClosedBanner: string;
  goalsTrackProgressHint: string;
  // Debts
  debtsSubtitle: string;
  debtsEmptyDesc: string;
  debtsTabLabel: string;
  receivablesTabLabel: string;
  // Subscriptions
  subscriptionsSubtitle: string;
  subscriptionsEmptyDesc: string;
  subscriptionsNoObligations: string;
  // Transactions
  linkedGoalMessage: string;
  getTransactionTypeLabel: (type: string) => string;
  // Reporting & Empty States
  noFundingInPeriod: string;
  noSpendingInPeriod: string;
  noActivityInPeriod: string;
  noBalanceYet: string;
};

export function getTransactionTypeLabel(
  type: string,
  isManaged: boolean,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  if (type === "income") {
    return isManaged
      ? t("transactions.funding") || "Dana Masuk"
      : t("transactions.income") || "Pemasukan";
  }
  if (type === "expense") {
    return isManaged
      ? t("transactions.spending") || "Pengeluaran"
      : t("transactions.expense") || "Pengeluaran";
  }
  if (type === "transfer") {
    return t("transactions.transfer") || "Transfer";
  }
  if (type === "adjustment") {
    return t("wallets.balanceAdjustment") || "Penyesuaian Saldo";
  }
  return type;
}

export function getSpaceReportingLabels(
  isManaged: boolean,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  if (isManaged) {
    return {
      balanceLabel: t("dashboard.managedBalance") || "Saldo Kelolaan",
      incomeLabel: t("dashboard.managedIncomeLabel") || "Dana Masuk",
      expenseLabel: t("dashboard.managedExpenseLabel") || "Pengeluaran",
      netFlowLabel: t("dashboard.managedNetFlow") || "Arus Bersih",
      incomeByCategoryLabel: t("analytics.managedIncomeByCategory") || "Dana Masuk per Kategori",
      spendingByCategoryLabel: t("dashboard.managedSpendingByCategory") || "Pengeluaran per Kategori",
      cashflowComparisonLabel: t("dashboard.managedCashflow") || "Dana Masuk vs Pengeluaran",
    };
  }

  return {
    balanceLabel: t("dashboard.netWorth") || "Kekayaan Bersih (Net Worth)",
    incomeLabel: t("dashboard.income") || "Pemasukan",
    expenseLabel: t("dashboard.expense") || "Pengeluaran",
    netFlowLabel: t("dashboard.netCashFlow") || "Arus Kas Bersih",
    incomeByCategoryLabel: t("analytics.incomeByCategory") || "Pemasukan per Kategori",
    spendingByCategoryLabel: t("dashboard.spendingByCategory") || "Pengeluaran per Kategori",
    cashflowComparisonLabel: t("dashboard.cashflow") || "Arus Kas",
  };
}

export function useSpaceTerminology(): SpaceTerminology {
  const { activeSpace } = useActiveSpace();
  const { t } = useI18n();
  const isManaged = activeSpace?.space_type === "managed";

  return useMemo(() => {
    if (isManaged) {
      return {
        isManaged: true,
        spaceType: "managed" as const,
        balanceLabel: t("dashboard.managedBalance") || "Saldo Kelolaan",
        incomeLabel: t("dashboard.managedIncomeLabel") || "Dana Masuk",
        expenseLabel: t("dashboard.managedExpenseLabel") || "Pengeluaran",
        netCashFlowLabel: t("dashboard.managedNetFlow") || "Arus Bersih",
        monthlyIncomeLabel: t("dashboard.managedIncome") || "Dana Masuk Bulan Ini",
        monthlyExpenseLabel: t("dashboard.managedExpense") || "Pengeluaran Bulan Ini",
        addIncomeLabel: t("quickAdd.managedIncome") || "Tambah Dana",
        addExpenseLabel: t("quickAdd.managedExpense") || "Tambah Pengeluaran",
        saveIncomeLabel: t("transactions.saveFunding") || "Simpan Dana Masuk",
        saveExpenseLabel: t("transactions.saveSpending") || "Simpan Pengeluaran",
        newIncomeTitle: t("transactions.newFunding") || "Tambah Dana",
        newExpenseTitle: t("transactions.newSpending") || "Pengeluaran Baru",
        incomeCategoryLabel: t("transactions.fundingCategory") || "Kategori Dana Masuk",
        expenseCategoryLabel: t("transactions.spendingCategory") || "Kategori Pengeluaran",
        dashboardOverviewTitle: t("dashboard.managedTitle") || "Berikut ringkasan saldo kelolaan space ini",
        cashflowTitle: t("dashboard.managedCashflow") || "Dana Masuk vs Pengeluaran",
        spendingByCategoryTitle: t("dashboard.managedSpendingByCategory") || "Pengeluaran per Kategori",
        totalExpenseLabel: t("dashboard.managedTotalExpense") || "Total Pengeluaran",
        noCashflowDesc:
          t("dashboard.managedNoCashflowDesc") ||
          "Data dana masuk dan pengeluaran akan tampil di sini seiring pencatatan transaksi.",
        noSpendingDesc:
          t("dashboard.managedNoSpendingDesc") ||
          "Catat transaksi pengeluaran untuk melihat rincian kategori di space ini.",
        noTransactionsDesc:
          t("dashboard.managedNoTransactionsDesc") ||
          "Catat dana masuk atau pengeluaran pertama di space ini.",

        // Analytics
        analyticsDescription:
          t("analytics.managedCashFlowOverview") ||
          "Pantau tren dana masuk, pengeluaran, arus bersih, dan alokasi dana kelolaan.",
        averageIncomeLabel: t("analytics.managedAverageIncome") || "Rata-rata Dana Masuk",
        incomeByCategoryLabel: t("analytics.managedIncomeByCategory") || "Dana Masuk per Kategori",
        balanceTrendTitle: t("analytics.managedBalanceTrend") || "Tren Saldo Kelolaan",
        noBalanceTrendTitle: t("analytics.managedNoBalanceTrend") || "Belum ada tren saldo kelolaan",
        noBalanceTrendDesc:
          t("analytics.managedNoBalanceTrendDesc") ||
          "Saldo dompet dan transaksi di space ini akan membentuk grafik tren.",
        surplusRatioTitle: t("analytics.managedSurplusRatio") || "Rasio Surplus",
        noIncomeYetTitle: t("analytics.managedNoIncomeYet") || "Belum ada dana masuk",
        surplusRateUnavailableDesc:
          t("analytics.managedSurplusUnavailable") ||
          "Rasio surplus belum dapat dihitung untuk periode ini.",
        analyticsFooterNote:
          t("analytics.managedFooterNote") ||
          "Biaya transfer termasuk dalam Pengeluaran. Pokok transfer dan penyesuaian saldo dikecualikan dari Dana Masuk, Pengeluaran, dan Arus Bersih.",

        // Calendar
        calendarDescription:
          t("calendar.managedSubtitle") ||
          "Lihat aktivitas dan jadwal dana masuk serta pengeluaran dalam tampilan bulanan.",

        // Budget
        budgetSubtitle:
          t("budgets.managedSubtitle") ||
          "Rencanakan dan pantau alokasi pengeluaran space ini secara terarah.",
        budgetEmptyDesc:
          t("budgets.managedEmptyDesc") ||
          "Atur batas alokasi untuk mengendalikan pengeluaran space ini.",
        budgetOverviewDesc:
          t("budgets.managedNoBudgetsInMonthDesc") ||
          "Kelola batas alokasi, amplop, cicilan, dan target dana per bulan.",
        budgetGoalTabLabel: t("goals.title") || "Target",

        // Goals
        goalsSubtitle:
          t("goals.managedSubtitle") ||
          "Rencanakan pos target dan pantau progres dana kelolaan secara terstruktur.",
        goalsEmptyDesc:
          t("goals.managedEmptyDesc") ||
          "Buat rencana target dana untuk space ini.",
        goalsAddContribution: t("goals.managedAddContribution") || "Tambah Alokasi Dana",
        goalsContributionHistory:
          t("goals.managedContributionHistory") || "Riwayat Alokasi Dana",
        goalsNoContributionsDesc:
          t("goals.managedNoContributionsDesc") ||
          "Tambahkan alokasi saat ingin memindahkan saldo ke kantong target space ini.",
        goalsClosedBanner:
          t("goals.managedClosedGoalBanner") ||
          "Target ini sudah ditutup. Riwayat alokasi dan catatan transaksi tetap tersimpan dalam riwayat space ini.",
        goalsTrackProgressHint:
          t("goals.managedTrackProgressHint") ||
          "KASH akan memantau progres alokasi dana menuju tenggat waktu ini.",

        // Debts
        debtsSubtitle:
          t("debts.managedSubtitle") ||
          "Pantau pinjaman, talangan, dan progres pelunasan pada space ini.",
        debtsEmptyDesc:
          t("debts.managedEmptyDesc") ||
          "Catat pinjaman atau talangan untuk memantau sisa pembayarannya pada space ini.",
        debtsTabLabel: t("debts.managedTabDebts") || "Daftar Utang",
        receivablesTabLabel: t("debts.managedTabReceivables") || "Daftar Piutang",

        // Subscriptions
        subscriptionsSubtitle:
          t("subscriptions.managedSubtitle") ||
          "Kelola pengeluaran rutin, langganan operasional, dan cicilan pada space ini.",
        subscriptionsEmptyDesc:
          t("subscriptions.managedEmptyDesc") ||
          "Catat pengeluaran rutin operasional atau tagihan space ini untuk mendapatkan pengingat jatuh tempo.",
        subscriptionsNoObligations:
          t("subscriptions.managedNoObligationsFound") ||
          "Tidak ada tagihan atau kewajiban pada space ini.",

        // Transactions
        linkedGoalMessage:
          t("transactions.managedLinkedGoal") ||
          "Transaksi terhubung dengan Target Dana. Perubahan dan pembatalan dikelola dari halaman Target.",
        getTransactionTypeLabel: (type: string) => getTransactionTypeLabel(type, true, t),

        // Reporting & Empty States
        noFundingInPeriod:
          t("analytics.managedNoFundingInPeriod") ||
          "Belum ada dana masuk pada periode ini.",
        noSpendingInPeriod:
          t("analytics.managedNoSpendingInPeriod") ||
          "Belum ada pengeluaran pada periode ini.",
        noActivityInPeriod:
          t("analytics.managedNoActivityInPeriod") ||
          "Belum ada aktivitas pada periode ini.",
        noBalanceYet:
          t("analytics.managedNoBalanceYet") ||
          "Belum ada saldo kelolaan.",
      };
    }

    return {
      isManaged: false,
      spaceType: "personal" as const,
      balanceLabel: t("dashboard.netWorth") || "Kekayaan Bersih (Net Worth)",
      incomeLabel: t("dashboard.income") || "Pemasukan",
      expenseLabel: t("dashboard.expense") || "Pengeluaran",
      netCashFlowLabel: t("dashboard.netCashFlow") || "Arus Kas Bersih",
      monthlyIncomeLabel: t("dashboard.monthlyIncome") || "Pemasukan Bulan Ini",
      monthlyExpenseLabel: t("dashboard.monthlyExpense") || "Pengeluaran Bulan Ini",
      addIncomeLabel: t("quickAdd.income") || "Tambah Pemasukan",
      addExpenseLabel: t("quickAdd.expense") || "Tambah Pengeluaran",
      saveIncomeLabel: t("transactions.saveIncome") || "Simpan Pemasukan",
      saveExpenseLabel: t("transactions.saveExpense") || "Simpan Pengeluaran",
      newIncomeTitle: t("transactions.newIncome") || "Pemasukan Baru",
      newExpenseTitle: t("transactions.newExpense") || "Pengeluaran Baru",
      incomeCategoryLabel: t("transactions.income") || "Kategori Pemasukan",
      expenseCategoryLabel: t("transactions.expense") || "Kategori Pengeluaran",
      dashboardOverviewTitle: t("dashboard.title") || "Berikut ringkasan keuangan Anda",
      cashflowTitle: t("dashboard.cashflow") || "Arus Kas",
      spendingByCategoryTitle: t("dashboard.spendingByCategory") || "Pengeluaran per Kategori",
      totalExpenseLabel: t("dashboard.totalExpense") || "Total Pengeluaran",
      noCashflowDesc:
        t("dashboard.noCashflowDesc") ||
        "Data arus kas masuk dan keluar akan tampil di sini seiring pencatatan transaksi.",
      noSpendingDesc:
        t("dashboard.noSpendingDesc") ||
        "Catat transaksi pengeluaran untuk melihat rincian kategori.",
      noTransactionsDesc:
        t("dashboard.noTransactionsDesc") ||
        "Catat pemasukan atau pengeluaran pertama Anda.",

      // Analytics
      analyticsDescription:
        t("analytics.cashFlowOverview") ||
        "Pantau tren pemasukan, pengeluaran, arus kas, dan kesehatan keuangan.",
      averageIncomeLabel: t("analytics.averageIncome") || "Rata-rata Pemasukan",
      incomeByCategoryLabel: t("analytics.incomeByCategory") || "Pemasukan per Kategori",
      balanceTrendTitle: t("analytics.netWorthTrend") || "Tren Kekayaan Bersih",
      noBalanceTrendTitle: t("analytics.noNetWorthTrend") || "Belum ada tren kekayaan bersih",
      noBalanceTrendDesc:
        t("analytics.noNetWorthTrendDesc") ||
        "Saldo dompet dan pencatatan transaksi akan membentuk grafik tren.",
      surplusRatioTitle: t("analytics.savingsRate") || "Rasio Tabungan",
      noIncomeYetTitle: t("analytics.noIncomeYet") || "Belum ada pemasukan",
      surplusRateUnavailableDesc:
        t("analytics.savingsRateUnavailable") ||
        "Rasio tabungan belum dapat dihitung untuk periode ini.",
      analyticsFooterNote:
        t("analytics.footerNote") ||
        "Biaya transfer termasuk dalam Pengeluaran. Pokok transfer dan penyesuaian saldo dikecualikan dari Pemasukan, Pengeluaran, dan Arus Kas.",

      // Calendar
      calendarDescription:
        t("calendar.subtitle") ||
        "Lihat aktivitas dan jadwal transaksi dalam tampilan bulanan.",

      // Budget
      budgetSubtitle:
        t("budgets.subtitle") ||
        "Rencanakan dan pantau alokasi pengeluaran bulanan Anda secara terarah.",
      budgetEmptyDesc:
        t("budgets.emptyDesc") ||
        "Atur batas pengeluaran untuk mengendalikan keuangan Anda.",
      budgetOverviewDesc:
        t("budgets.noBudgetsInMonthDesc") ||
        "Kelola batas anggaran, amplop, cicilan, dan target tabungan per bulan.",
      budgetGoalTabLabel: t("dashboard.savings") || "Tabungan",

      // Goals
      goalsSubtitle:
        t("goals.subtitle") ||
        "Rencanakan tabungan untuk impian masa depan atau dana darurat.",
      goalsEmptyDesc:
        t("goals.emptyDesc") ||
        "Buat rencana tabungan untuk impian atau dana darurat Anda.",
      goalsAddContribution: t("goals.addContribution") || "Tambah Alokasi Tabungan",
      goalsContributionHistory:
        t("goals.contributionHistory") || "Riwayat Alokasi Tabungan",
      goalsNoContributionsDesc:
        t("goals.noContributionsDesc") ||
        "Tambahkan alokasi saat Anda ingin memindahkan uang dari dompet ke kantong tabungan target ini.",
      goalsClosedBanner:
        t("goals.closedGoalBanner") ||
        "Target ini sudah ditutup. Riwayat alokasi dan catatan transaksi tetap tersimpan dalam riwayat Anda.",
      goalsTrackProgressHint:
        t("goals.trackProgressHint") ||
        "KASH akan memantau progres tabungan menuju tenggat waktu ini.",

      // Debts
      debtsSubtitle:
        t("debts.subtitle") ||
        "Pantau kewajiban, piutang, pembayaran, dan riwayat pelunasan.",
      debtsEmptyDesc:
        t("debts.emptyDesc") ||
        "Catat pinjaman atau talangan untuk memantau sisa pembayarannya.",
      debtsTabLabel: t("debts.tabDebts") || "Utang Saya",
      receivablesTabLabel: t("debts.tabReceivables") || "Piutang Saya",

      // Subscriptions
      subscriptionsSubtitle:
        t("subscriptions.subtitle") ||
        "Kelola seluruh pengeluaran rutin, cicilan, dan langganan berkala secara otomatis.",
      subscriptionsEmptyDesc:
        t("subscriptions.emptyDesc") ||
        "Pantau tagihan bulanan Netflix, Spotify, listrik PLN, atau cicilan dengan mudah.",
      subscriptionsNoObligations:
        t("subscriptions.noObligationsFound") ||
        "Tidak ada tagihan atau langganan.",

      // Transactions
      linkedGoalMessage:
        t("transactions.linkedGoal") ||
        "Transaksi terhubung dengan Target Tabungan. Perubahan dan pembatalan dikelola dari halaman Target Tabungan.",
      getTransactionTypeLabel: (type: string) => getTransactionTypeLabel(type, false, t),

      // Reporting & Empty States
      noFundingInPeriod:
        t("analytics.noIncomeYet") ||
        "Belum ada pemasukan pada periode ini.",
      noSpendingInPeriod:
        t("analytics.noSpendingTitle") ||
        "Belum ada pengeluaran pada periode ini.",
      noActivityInPeriod:
        t("analytics.noTrendData") ||
        "Belum ada aktivitas pada periode ini.",
      noBalanceYet:
        t("analytics.noNetWorthTrend") ||
        "Belum ada data kekayaan bersih.",
    };
  }, [isManaged, t]);
}
