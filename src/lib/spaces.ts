import type { FinancialSpace } from "../types/domain";
import { supabase } from "./supabase";

export const ACTIVE_SPACE_STORAGE_KEY = "kash_active_space_id";

let cachedActiveSpaceId: string | null = (() => {
  try {
    return typeof window !== "undefined" ? localStorage.getItem(ACTIVE_SPACE_STORAGE_KEY) : null;
  } catch {
    return null;
  }
})();

export function getActiveSpaceId(): string | null {
  return cachedActiveSpaceId;
}

export function setActiveSpaceId(spaceId: string | null): void {
  cachedActiveSpaceId = spaceId;
  try {
    if (typeof window !== "undefined") {
      if (spaceId) {
        localStorage.setItem(ACTIVE_SPACE_STORAGE_KEY, spaceId);
      } else {
        localStorage.removeItem(ACTIVE_SPACE_STORAGE_KEY);
      }
    }
  } catch {
    // ignore storage quota / access errors
  }
}

export async function getFinancialSpaces(): Promise<{
  data: FinancialSpace[] | null;
  error: Error | null;
}> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from("financial_spaces")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { data: (data as FinancialSpace[]) ?? [], error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getPersonalSpace(): Promise<{
  data: FinancialSpace | null;
  error: Error | null;
}> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { data: null, error: null };
    }

    const { data, error } = await supabase
      .from("financial_spaces")
      .select("*")
      .eq("owner_user_id", user.id)
      .eq("space_type", "personal")
      .maybeSingle();

    if (error) throw error;
    return { data: (data as FinancialSpace) ?? null, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}
