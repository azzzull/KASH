import { lazy, Suspense, type ComponentType, type ReactElement } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { OnboardingRoute, ProtectedRoute, PublicRoute } from "../components/auth/AuthGate";
import { RouteErrorBoundary } from "../components/errors/RouteErrorBoundary";
import { AppShell } from "../layouts/AppShell";

function lazyPage<TModule extends Record<TExport, ComponentType>, TExport extends keyof TModule>(
  importer: () => Promise<TModule>,
  exportName: TExport,
) {
  return lazy(async () => {
    const module = await importer();
    return { default: module[exportName] };
  });
}

const AnalyticsPage = lazyPage(() => import("../pages/AnalyticsPage"), "AnalyticsPage");
const BudgetsPage = lazyPage(() => import("../pages/BudgetsPage"), "BudgetsPage");
const BudgetDetailPage = lazyPage(() => import("../pages/BudgetDetailPage"), "BudgetDetailPage");
const CalendarPage = lazyPage(() => import("../pages/CalendarPage"), "CalendarPage");
const CategoriesPage = lazyPage(() => import("../pages/CategoriesPage"), "CategoriesPage");
const DashboardPage = lazyPage(() => import("../pages/DashboardPage"), "DashboardPage");
const DebtsPage = lazyPage(() => import("../pages/DebtsPage"), "DebtsPage");
const DebtDetailPage = lazyPage(() => import("../pages/DebtDetailPage"), "DebtDetailPage");
const GoalsPage = lazyPage(() => import("../pages/GoalsPage"), "GoalsPage");
const GoalDetailPage = lazyPage(() => import("../pages/GoalDetailPage"), "GoalDetailPage");
const LoginPage = lazyPage(() => import("../pages/LoginPage"), "LoginPage");
const NotificationsPage = lazyPage(() => import("../pages/NotificationsPage"), "NotificationsPage");
const OnboardingPage = lazyPage(() => import("../pages/OnboardingPage"), "OnboardingPage");
const SettingsPage = lazyPage(() => import("../pages/SettingsPage"), "SettingsPage");
const SharedSavingsPage = lazyPage(() => import("../pages/SharedSavingsPage"), "SharedSavingsPage");
const SharedSavingsDetailPage = lazyPage(() => import("../pages/SharedSavingsDetailPage"), "SharedSavingsDetailPage");
const SubscriptionsPage = lazyPage(() => import("../pages/SubscriptionsPage"), "SubscriptionsPage");
const SubscriptionDetailPage = lazyPage(() => import("../pages/SubscriptionDetailPage"), "SubscriptionDetailPage");
const TransactionsPage = lazyPage(() => import("../pages/TransactionsPage"), "TransactionsPage");
const WalletsPage = lazyPage(() => import("../pages/WalletsPage"), "WalletsPage");
const WalletDetailPage = lazyPage(() => import("../pages/WalletDetailPage"), "WalletDetailPage");

function RouteLoadingFallback() {
  return (
    <div className="min-h-[60dvh] animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="h-4 w-24 rounded-full bg-slate-100" />
      <div className="mt-4 h-8 w-52 rounded-full bg-slate-100" />
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        <div className="h-24 rounded-lg bg-slate-100" />
        <div className="h-24 rounded-lg bg-slate-100" />
        <div className="h-24 rounded-lg bg-slate-100" />
      </div>
      <div className="mt-5 h-60 rounded-lg bg-slate-100" />
    </div>
  );
}

function routeElement(element: ReactElement) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace />, errorElement: <RouteErrorBoundary /> },
  {
    element: <PublicRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/login", element: routeElement(<LoginPage />) },
    ],
  },
  {
    element: <OnboardingRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/onboarding", element: routeElement(<OnboardingPage />) },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: "/dashboard", element: routeElement(<DashboardPage />) },
          { path: "/transactions", element: routeElement(<TransactionsPage />) },
          { path: "/budgets", element: routeElement(<BudgetsPage />) },
          { path: "/budgets/:id", element: routeElement(<BudgetDetailPage />) },
          { path: "/wallets", element: routeElement(<WalletsPage />) },
          { path: "/wallets/:id", element: routeElement(<WalletDetailPage />) },
          { path: "/calendar", element: routeElement(<CalendarPage />) },
          { path: "/analytics", element: routeElement(<AnalyticsPage />) },
          { path: "/goals", element: routeElement(<GoalsPage />) },
          { path: "/goals/:id", element: routeElement(<GoalDetailPage />) },
          { path: "/debts", element: routeElement(<DebtsPage />) },
          { path: "/debts/:counterpartyId", element: routeElement(<DebtDetailPage />) },
          { path: "/subscriptions", element: routeElement(<SubscriptionsPage />) },
          { path: "/subscriptions/:id", element: routeElement(<SubscriptionDetailPage />) },
          { path: "/shared-savings", element: routeElement(<SharedSavingsPage />) },
          { path: "/shared-savings/:id", element: routeElement(<SharedSavingsDetailPage />) },
          { path: "/shared", element: <Navigate to="/shared-savings" replace /> },
          { path: "/notifications", element: routeElement(<NotificationsPage />) },
          { path: "/settings", element: routeElement(<SettingsPage />) },
          { path: "/settings/categories", element: routeElement(<CategoriesPage />) },
        ],
      },
    ],
  },
]);
