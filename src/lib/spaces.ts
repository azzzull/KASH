import type {
  FinancialSpace,
  ManagedSpaceInvitation,
  ManagedSpaceInvitationResponse,
  ManagedSpaceMemberItem,
  ManagedSpaceRole,
} from "../types/domain";
import { supabase } from "./supabase";

export const USER_ACTIVE_SPACE_KEY_PREFIX = "kash:active-space:";
export const LEGACY_ACTIVE_SPACE_STORAGE_KEY = "kash_active_space_id";

let currentUserId: string | null = null;
let cachedActiveSpaceId: string | null = null;

export function getActiveSpaceId(): string | null {
  return cachedActiveSpaceId;
}

export function getStoredActiveSpaceId(userId?: string): string | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const userKey = `${USER_ACTIVE_SPACE_KEY_PREFIX}${userId}`;
    const userScoped = localStorage.getItem(userKey);
    if (userScoped) return userScoped;

    // Clean up legacy un-scoped key
    localStorage.removeItem(LEGACY_ACTIVE_SPACE_STORAGE_KEY);
  } catch {
    // ignore localStorage access error
  }
  return null;
}

export function setActiveSpaceId(spaceId: string | null, userId?: string): void {
  cachedActiveSpaceId = spaceId;
  if (userId) {
    currentUserId = userId;
  }

  if (typeof window === "undefined") return;

  try {
    // Clean up legacy un-scoped key
    localStorage.removeItem(LEGACY_ACTIVE_SPACE_STORAGE_KEY);

    const targetUser = userId || currentUserId;
    if (targetUser) {
      const userKey = `${USER_ACTIVE_SPACE_KEY_PREFIX}${targetUser}`;
      if (spaceId) {
        localStorage.setItem(userKey, spaceId);
      } else {
        localStorage.removeItem(userKey);
      }
    }
  } catch {
    // ignore storage quota / access errors
  }
}

export function clearActiveSpaceState(): void {
  currentUserId = null;
  cachedActiveSpaceId = null;
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(LEGACY_ACTIVE_SPACE_STORAGE_KEY);
    }
  } catch {
    // ignore
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
      .is("deleted_at", null)
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
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    return { data: (data as FinancialSpace) ?? null, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function createManagedSpace(name: string): Promise<{
  data: FinancialSpace | null;
  error: Error | null;
}> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("You need to be signed in to create a Financial Space.");
    }

    const { data, error } = await supabase.rpc("create_managed_space", {
      p_space_name: name,
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
    const { error } = await supabase.rpc("archive_managed_space", { p_space_id: spaceId });
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
    const { error } = await supabase.rpc("restore_managed_space", { p_space_id: spaceId });
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
    const { error } = await supabase.rpc("delete_managed_space", { p_space_id: spaceId });
    if (error) throw error;
    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}

export async function getManagedSpaceMembers(spaceId: string): Promise<{
  data: ManagedSpaceMemberItem[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc("get_managed_space_members", {
      p_space_id: spaceId,
    });
    if (error) throw error;
    return { data: (data as ManagedSpaceMemberItem[]) ?? [], error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getManagedSpaceMemberIdentities(spaceId: string): Promise<{
  data: { user_id: string; full_name: string | null; avatar_url: string | null }[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc("get_managed_space_member_identities", {
      p_space_id: spaceId,
    });
    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function addManagedSpaceMember(
  spaceId: string,
  email: string,
  role: ManagedSpaceRole
): Promise<{
  data: { success: boolean; invitation_id: string; duplicate: boolean } | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc("invite_managed_space_member", {
      p_space_id: spaceId,
      p_email: email,
      p_role: role,
    });
    if (error) throw error;
    return { data: data ?? null, error: null };
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export const inviteManagedSpaceMember = addManagedSpaceMember;

export async function getManagedSpaceInvitations(spaceId: string): Promise<{
  data: ManagedSpaceInvitation[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc("get_managed_space_invitations", {
      p_space_id: spaceId,
    });
    if (error) throw error;
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Unable to load invitations.") };
  }
}

export async function getManagedSpaceInvitation(invitationId: string): Promise<{
  data: ManagedSpaceInvitation | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc("get_managed_space_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) throw error;
    return { data: data?.[0] ?? null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Unable to load invitation.") };
  }
}

export async function respondManagedSpaceInvitation(
  invitationId: string,
  action: "accept" | "decline",
): Promise<{ data: ManagedSpaceInvitationResponse | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc("respond_managed_space_invitation", {
      p_invitation_id: invitationId,
      p_action: action,
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Unable to respond to invitation.") };
  }
}

export async function cancelManagedSpaceInvitation(invitationId: string): Promise<{
  error: Error | null;
}> {
  try {
    const { error } = await supabase.rpc("cancel_managed_space_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) throw error;
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error("Unable to cancel invitation.") };
  }
}

export async function updateManagedSpaceMemberRole(
  spaceId: string,
  userId: string,
  newRole: ManagedSpaceRole
): Promise<{
  error: Error | null;
}> {
  try {
    const { error } = await supabase.rpc("update_managed_space_member_role", {
      p_space_id: spaceId,
      p_user_id: userId,
      p_new_role: newRole,
    });
    if (error) throw error;
    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}

export async function removeManagedSpaceMember(
  spaceId: string,
  userId: string
): Promise<{
  error: Error | null;
}> {
  try {
    const { error } = await supabase.rpc("remove_managed_space_member", {
      p_space_id: spaceId,
      p_user_id: userId,
    });
    if (error) throw error;
    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}

export async function leaveManagedSpace(
  spaceId: string
): Promise<{
  error: Error | null;
}> {
  try {
    const { error } = await supabase.rpc("leave_managed_space", {
      p_space_id: spaceId,
    });
    if (error) throw error;
    return { error: null };
  } catch (err: any) {
    return { error: err };
  }
}

