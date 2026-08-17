import { supabase } from "./supabase";

const getOAuthRedirectUrl = () => {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/dashboard`;
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

export async function getCurrentProfile(userId: string) {
  return supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
}

export async function updateProfileCurrency(userId: string, currency: string) {
  return supabase.from("profiles").update({ default_currency: currency }).eq("id", userId).select("*").single();
}

export async function completeProfileOnboarding(userId: string) {
  return supabase.from("profiles").update({ onboarding_completed: true }).eq("id", userId).select("*").single();
}

export async function signOut() {
  return supabase.auth.signOut();
}
