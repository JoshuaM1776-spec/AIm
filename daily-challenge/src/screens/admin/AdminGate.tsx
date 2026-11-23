import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { ErrorNote, Page, Spinner, TopBar } from "../../components/ui.tsx";
import { useAuth } from "../../lib/auth.tsx";

export function useAdminGate() {
  const { session, me, ready, meError } = useAuth();
  if (session && !me && meError) return "error" as const;
  if (!ready || (session && !me)) return "loading" as const;
  if (!session) return "signin" as const;
  return me?.profile.is_admin ? ("ok" as const) : ("forbidden" as const);
}

export function AdminGate({ children }: { children: ReactNode }) {
  const gate = useAdminGate();
  if (gate === "error") return <Page><TopBar back="/" /><ErrorNote className="mt-6" message="Couldn't check your account. Please try again." onRetry={() => window.location.reload()} /></Page>;
  if (gate === "loading") return <Page><Spinner /></Page>;
  if (gate === "signin") return <Navigate to="/signin?next=/admin" replace />;
  if (gate === "forbidden") return <Page><TopBar back="/" /><ErrorNote className="mt-6" message="Challenge management is only for administrators." /></Page>;
  return <>{children}</>;
}

