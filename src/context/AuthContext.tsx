import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Profile } from "../types/domain";
import {
  getCurrentProfile,
  resendConfirmationEmail as resendConfirmationEmailRequest,
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

  signInWithGoogle: () => Promise<{
    errorMessage: string | null;
  }>;

  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{
    errorMessage: string | null;
  }>;

  signUpWithPassword: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{
    errorMessage: string | null;
    needsEmailConfirmation?: boolean;
  }>;

  resendConfirmationEmail: (
    email: string,
  ) => Promise<{
    errorMessage: string | null;
  }>;

  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function formatAuthError(
  error: Error | { message?: string } | null,
): string {
  if (!error || !error.message) {
    return "An unexpected error occurred. Please try again.";
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return "Invalid email or password. Please try again.";
  }

  if (
    message.includes("user already registered") ||
    message.includes("already exists")
  ) {
    return "An account with this email already exists. Please sign in.";
  }

  if (message.includes("password should be at least")) {
    return "Password must be at least 6 characters.";
  }

  if (message.includes("email not confirmed")) {
    return "Please check your inbox to confirm your email before signing in.";
  }

  if (
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
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
  const profileRequestIdRef = useRef(0);

  const loadProfile = async (userId: string) => {
    const requestId = profileRequestIdRef.current + 1;
    profileRequestIdRef.current = requestId;
    setProfileLoading(true);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data, error } = await getCurrentProfile(userId);

      if (profileRequestIdRef.current !== requestId) {
        return;
      }

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

      if (profileRequestIdRef.current !== requestId) {
        return;
      }
    }

    setProfile(null);
    setProfileLoading(false);
  };

  const refreshProfile = async () => {
    if (!session?.user.id || !isSupabaseConfigured) {
      return;
    }

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
    let initialSessionResolved = false;

    const clearProfile = () => {
      profileRequestIdRef.current += 1;
      setProfile(null);
      setProfileLoading(false);
    };

    const applySession = (nextSession: Session | null) => {
      if (!mounted) {
        return;
      }

      setSession(nextSession);
      setStatus(nextSession ? "authenticated" : "unauthenticated");

      if (nextSession?.user.id) {
        void loadProfile(nextSession.user.id);
      } else {
        clearProfile();
      }
    };

    const resolveInitialSession = (nextSession: Session | null) => {
      if (initialSessionResolved) {
        return;
      }

      initialSessionResolved = true;
      applySession(nextSession);
    };

    supabase.auth.getSession().then(async ({ data }) => {
      resolveInitialSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") {
        resolveInitialSession(nextSession);
        return;
      }

      if (!initialSessionResolved && !nextSession && event !== "SIGNED_OUT") {
        return;
      }

      initialSessionResolved = true;
      applySession(nextSession);
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
          return {
            errorMessage:
              "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
          };
        }

        const { error } = await signInWithGoogleRequest();

        return {
          errorMessage: error ? formatAuthError(error) : null,
        };
      },

      signInWithPassword: async (
        email: string,
        password: string,
      ) => {
        if (!isSupabaseConfigured) {
          return {
            errorMessage:
              "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
          };
        }

        const { error } = await signInWithEmailPassword(
          email,
          password,
        );

        return {
          errorMessage: error ? formatAuthError(error) : null,
        };
      },

      signUpWithPassword: async (
        email: string,
        password: string,
        fullName?: string,
      ) => {
        if (!isSupabaseConfigured) {
          return {
            errorMessage:
              "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
          };
        }

        const { data, error } = await signUpWithEmailPassword(
          email,
          password,
          fullName,
        );

        if (error) {
          return {
            errorMessage: formatAuthError(error),
          };
        }

        /*
         * When email confirmation is enabled,
         * Supabase may return a user object without a session.
         *
         * For an already-registered account,
         * Supabase can return an empty identities array to avoid
         * leaking whether a user exists.
         */
        if (
          data?.user &&
          Array.isArray(data.user.identities) &&
          data.user.identities.length === 0
        ) {
          return {
            errorMessage:
              "An account with this email already exists. Please sign in instead.",
          };
        }

        const needsEmailConfirmation = Boolean(
          data?.user && !data?.session,
        );

        return {
          errorMessage: null,
          needsEmailConfirmation,
        };
      },

      resendConfirmationEmail: async (email: string) => {
        if (!isSupabaseConfigured) {
          return {
            errorMessage:
              "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
          };
        }

        const { error } =
          await resendConfirmationEmailRequest(email);

        return {
          errorMessage: error ? formatAuthError(error) : null,
        };
      },

      signOut: async () => {
        await signOutRequest();

        profileRequestIdRef.current += 1;
        setSession(null);
        setProfile(null);
        setProfileLoading(false);
        setStatus("unauthenticated");
      },
    }),
    [
      profile,
      profileLoading,
      session,
      status,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
