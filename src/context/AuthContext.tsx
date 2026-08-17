import type { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { Profile } from "../types/domain";
import {
  getCurrentProfile,
  signInWithEmailPassword,
  signInWithGoogle as signInWithGoogleRequest,
  signOut as signOutRequest,
  signUpWithEmailPassword,
} from "../lib/auth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  signInWithGoogle: () => Promise<{ errorMessage: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ errorMessage: string | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ errorMessage: string | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function formatAuthError(error: Error | { message?: string } | null): string {
  if (!error || !error.message) return "An unexpected error occurred. Please try again.";

  const message = error.message.toLowerCase();

  if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return "Invalid email or password. Please try again.";
  }
  if (message.includes("user already registered") || message.includes("already exists")) {
    return "An account with this email already exists. Please sign in.";
  }
  if (message.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }
  if (message.includes("email not confirmed")) {
    return "Please check your inbox to confirm your email before signing in.";
  }
  if (message.includes("rate limit") || message.includes("too many requests")) {
    return "Too many attempts. Please wait a few moments and try again.";
  }

  return error.message;
}

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = async (userId: string) => {
    setProfileLoading(true);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data, error } = await getCurrentProfile(userId);

      if (error) {
        console.error("Failed to load profile", error);
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      if (data) {
        setProfile(data);
        setProfileLoading(false);
        return;
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 300);
      });
    }

    setProfile(null);
    setProfileLoading(false);
  };

  const refreshProfile = async () => {
    if (!session?.user.id || !isSupabaseConfigured) return;
    await loadProfile(session.user.id);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      setProfile(null);
      setStatus("unauthenticated");
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;

      setSession(data.session);
      setStatus(data.session ? "authenticated" : "unauthenticated");

      if (data.session?.user.id) {
        await loadProfile(data.session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "unauthenticated");

      if (nextSession?.user.id) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      profile,
      profileLoading,
      refreshProfile,
      signInWithGoogle: async () => {
        if (!isSupabaseConfigured) {
          return { errorMessage: "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." };
        }

        const { error } = await signInWithGoogleRequest();
        return { errorMessage: error ? formatAuthError(error) : null };
      },
      signInWithPassword: async (email: string, password: string) => {
        if (!isSupabaseConfigured) {
          return { errorMessage: "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." };
        }

        const { error } = await signInWithEmailPassword(email, password);
        return { errorMessage: error ? formatAuthError(error) : null };
      },
      signUpWithPassword: async (email: string, password: string, fullName?: string) => {
        if (!isSupabaseConfigured) {
          return { errorMessage: "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." };
        }

        const { data, error } = await signUpWithEmailPassword(email, password, fullName);

        if (error) {
          return { errorMessage: formatAuthError(error) };
        }

        const needsEmailConfirmation = Boolean(data?.user && !data?.session);
        return { errorMessage: null, needsEmailConfirmation };
      },
      signOut: async () => {
        await signOutRequest();
        setSession(null);
        setProfile(null);
        setStatus("unauthenticated");
      },
    }),
    [profile, profileLoading, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
