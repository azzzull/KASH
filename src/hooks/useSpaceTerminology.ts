import { useMemo } from "react";
import { useActiveSpace } from "../context/ActiveSpaceContext";
import { useI18n } from "../i18n";

export type SpaceTerminology = {
  isManaged: boolean;
  spaceType: "personal" | "managed";
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
};

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
    };
  }, [isManaged, t]);
}
