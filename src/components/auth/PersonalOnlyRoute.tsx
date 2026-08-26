import { Navigate, Outlet } from "react-router-dom";
import { useActiveSpace } from "../../context/ActiveSpaceContext";

export function PersonalOnlyRoute() {
  const { activeSpace, loading } = useActiveSpace();

  if (loading) {
    return (
      <div className="min-h-[60dvh] animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="h-4 w-24 rounded-full bg-slate-100" />
        <div className="mt-4 h-8 w-52 rounded-full bg-slate-100" />
      </div>
    );
  }

  // Shared Savings is Personal context only in V1.
  // If active space is Managed, safely redirect to Managed Dashboard.
  if (activeSpace && activeSpace.space_type !== "personal") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
