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

export async function createManagedSpace(name: string, walletName: string, walletType: string): Promise<{
  data: FinancialSpace | null;
  error: Error | null;
}> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("You need to be signed in to create a Financial Space.");
    }

    const { data, error } = await supabase.rpc("create_managed_space_with_wallet" as any, {
      p_space_name: name,
      p_wallet_name: walletName,
      p_wallet_type: walletType,
    });

    if (error) throw error;
    return { data: data as FinancialSpace, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function renameManagedSpace(
  spaceId: string,
  name: string
): Promise<{
  data: FinancialSpace | null;
  error: Error | null;
}> {
  try {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Nama Financial Space tidak boleh kosong.");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("You need to be signed in to edit a Financial Space.");
    }

    // Verify it is not a personal space
    const { data: existing, error: findError } = await supabase
      .from("financial_spaces")
      .select("space_type")
      .eq("id", spaceId)
      .eq("owner_user_id", user.id)
      .single();

    if (findError || !existing) {
      throw new Error("Financial Space tidak ditemukan.");
    }

    if (existing.space_type === "personal") {
      throw new Error("Personal Space cannot be renamed.");
    }

    const { data, error } = await supabase
      .from("financial_spaces")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", spaceId)
      .eq("owner_user_id", user.id)
      .select("*")
      .single();

    if (error) throw error;
    return { data: data as FinancialSpace, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function archiveManagedSpace(spaceId: string): Promise<{
  error: Error | null;
}> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("You need to be signed in to archive a Financial Space.");
    }

    // Check not personal space
    const { data: existing, error: findError } = await supabase
      .from("financial_spaces")
      .select("space_type")
      .eq("id", spaceId)
      .eq("owner_user_id", user.id)
      .single();

    if (findError || !existing) {
      throw new Error("Financial Space tidak ditemukan.");
    }

    if (existing.space_type === "personal") {
      throw new Error("Personal Space cannot be archived.");
    }

    const { error } = await supabase
      .from("financial_spaces")
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq("id", spaceId)
      .eq("owner_user_id", user.id);

    if (error) throw error;
    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}

export async function restoreManagedSpace(spaceId: string): Promise<{
  error: Error | null;
}> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("You need to be signed in to restore a Financial Space.");
    }

    const { error } = await supabase
      .from("financial_spaces")
      .update({ is_archived: false, updated_at: new Date().toISOString() })
      .eq("id", spaceId)
      .eq("owner_user_id", user.id);

    if (error) throw error;
    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}

export async function deleteManagedSpace(spaceId: string): Promise<{
  error: Error | null;
}> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("You need to be signed in to delete a Financial Space.");
    }

    const { error } = await supabase.rpc("delete_managed_space" as any, { p_space_id: spaceId });
    if (error) throw error;
    
    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}
