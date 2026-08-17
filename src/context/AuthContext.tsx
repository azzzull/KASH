import type { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { Profile } from "../types/domain";
import { getCurrentProfile, signInWithGoogle as signInWithGoogleRequest, signOut as signOutRequest } from "../lib/auth";
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
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
        return { errorMessage: error?.message ?? null };
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
