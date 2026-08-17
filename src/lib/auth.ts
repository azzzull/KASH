import { supabase } from "./supabase";

const getOAuthRedirectUrl = () => {
    if (typeof window === "undefined") return undefined;

    const configuredOrigin =
        import.meta.env.VITE_APP_URL || import.meta.env.VITE_SITE_URL;

    if (configuredOrigin) {
        return `${configuredOrigin.replace(/\/$/, "")}/dashboard`;
    }

    const origin = window.location.origin;
    const hostname = new URL(origin).hostname;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return "https://my-kash.netlify.app/dashboard";
    }

    return `${origin.replace(/\/$/, "")}/dashboard`;
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

export async function signOut() {
    return supabase.auth.signOut();
}
