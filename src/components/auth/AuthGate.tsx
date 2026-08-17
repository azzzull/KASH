import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function AuthLoading() {
  return (
    <div className="kash-page-bg flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-kash-emerald/10 bg-white/95 p-5 shadow-sm">
        <div className="h-3 w-24 rounded-full bg-slate-200" />
        <div className="mt-5 h-8 w-3/4 rounded-lg bg-slate-100" />
        <div className="mt-3 h-3 w-full rounded-full bg-slate-100" />
        <div className="mt-2 h-3 w-2/3 rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const { status, profile, profileLoading } = useAuth();
  const location = useLocation();

  if (status === "loading" || (profileLoading && !profile)) {
    return <AuthLoading />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!profile?.onboarding_completed && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

export function PublicRoute() {
  const { status, profile, profileLoading } = useAuth();

  if (status === "loading" || (profileLoading && !profile)) {
    return <AuthLoading />;
  }

  if (status === "authenticated") {
    return <Navigate to={profile?.onboarding_completed ? "/dashboard" : "/onboarding"} replace />;
  }

  return <Outlet />;
}

export function OnboardingRoute() {
  const { status, profile, profileLoading } = useAuth();
  const location = useLocation();
  const onboardingState = location.state as { showFinish?: boolean } | null;

  if (status === "loading" || (profileLoading && !profile)) {
    return <AuthLoading />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (profile?.onboarding_completed && !onboardingState?.showFinish) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
