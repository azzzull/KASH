import { supabase } from "./supabase";

const getOAuthRedirectUrl = () => {
  if (typeof window === "undefined") return undefined;

  const configuredOrigin = import.meta.env.VITE_APP_URL || import.meta.env.VITE_SITE_URL;
  if (configuredOrigin) {
    return `${configuredOrigin.replace(/\/$/, "")}/dashboard`;
  }

  return `${window.location.origin.replace(/\/$/, "")}/dashboard`;
};

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      queryParams: {
        prompt: "select_account consent",
      },
      redirectTo: getOAuthRedirectUrl(),
    },
  });
}

export async function signInWithEmailPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
}

export async function signUpWithEmailPassword(email: string, password: string, fullName?: string) {
  return supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName?.trim() || null,
      },
      emailRedirectTo: getOAuthRedirectUrl(),
    },
  });
}

export async function getCurrentProfile(userId: string) {
  return supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
}

export async function updateProfileFullName(userId: string, fullName: string) {
  return supabase
    .from("profiles")
    .update({ full_name: fullName.trim() })
    .eq("id", userId)
    .select("*")
    .single();
}

export async function updateProfileCurrency(userId: string, currency: string) {
  return supabase
    .from("profiles")
    .update({ default_currency: currency })
    .eq("id", userId)
    .select("*")
    .single();
}

export async function completeProfileOnboarding(userId: string) {
  return supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", userId)
    .select("*")
    .single();
}

export async function resendConfirmationEmail(email: string) {
  return supabase.auth.resend({
    type: "signup",
    email: email.trim(),
    options: {
      emailRedirectTo: getOAuthRedirectUrl(),
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}


