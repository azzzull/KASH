import type { Category, CategoryType } from "../types/domain";
import { getActiveSpaceId } from "./spaces";
import { supabase } from "./supabase";

export type CreateCategoryInput = {
  name: string;
  categoryType: CategoryType;
  icon: string;
  color: string;
};

export type UpdateCategoryInput = {
  name: string;
  icon: string;
  color: string;
};

async function getAuthenticatedUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("You need to be signed in to manage categories.");
  }

  return user.id;
}

export async function getSystemCategories() {
  return supabase
    .from("categories")
    .select("*")
    .eq("is_system", true)
    .eq("is_archived", false)
    .order("category_type", { ascending: true })
    .order("name", { ascending: true });
}

export async function getUserCategories(spaceId?: string) {
  const targetSpaceId = spaceId ?? getActiveSpaceId();
  let query = supabase
    .from("categories")
    .select("*")
    .eq("is_system", false)
    .order("category_type", { ascending: true })
    .order("name", { ascending: true });

  if (targetSpaceId) {
    query = query.eq("space_id", targetSpaceId);
  } else {
    query = query.is("space_id", null);
  }

  return query;
}

export async function getActiveCategories(spaceId?: string) {
  const targetSpaceId = spaceId ?? getActiveSpaceId();
  let query = supabase
    .from("categories")
    .select("*")
    .eq("is_archived", false)
    .order("category_type", { ascending: true })
    .order("name", { ascending: true });

  if (targetSpaceId) {
    query = query.or(`is_system.eq.true,space_id.eq.${targetSpaceId}`);
  } else {
    query = query.or(`is_system.eq.true,space_id.is.null`);
  }

  return query;
}

export async function createCategory(input: CreateCategoryInput, spaceId?: string) {
  const userId = await getAuthenticatedUserId();
  const targetSpaceId = spaceId ?? getActiveSpaceId() ?? undefined;

  return supabase
    .from("categories")
    .insert({
      user_id: userId,
      space_id: targetSpaceId,
      name: input.name,
      category_type: input.categoryType,
      icon: input.icon,
      color: input.color,
      is_system: false,
      is_archived: false,
    })
    .select("*")
    .single();
}

export async function updateCategory(category: Category, input: UpdateCategoryInput) {
  if (category.is_system) {
    throw new Error("System categories cannot be edited.");
  }

  return supabase
    .from("categories")
    .update({
      name: input.name,
      icon: input.icon,
      color: input.color,
    })
    .eq("id", category.id)
    .eq("is_system", false)
    .select("*")
    .single();
}

export async function archiveCategory(category: Category) {
  if (category.is_system) {
    throw new Error("System categories cannot be archived.");
  }

  return supabase
    .from("categories")
    .update({ is_archived: true })
    .eq("id", category.id)
    .eq("is_system", false)
    .select("*")
    .single();
}

export async function unarchiveCategory(categoryId: string) {
  return supabase
    .from("categories")
    .update({ is_archived: false })
    .eq("id", categoryId)
    .eq("is_system", false)
    .select("*")
    .single();
}

export async function deleteCategory(category: Category) {
  if (category.is_system) {
    throw new Error("Kategori sistem bawaan tidak dapat dihapus.");
  }

  const { data, error } = await supabase.rpc("delete_custom_category" as any, {
    p_category_id: category.id,
  });

  if (error) {
    throw error;
  }

  return { data, error: null };
}

export type QuickCreateCategoryResult =
  | { success: true; category: Category; restored?: boolean }
  | { success: false; error: string; archivedCategory?: Category };

export async function quickCreateCategory(input: {
  name: string;
  categoryType: CategoryType;
  icon?: string;
  color?: string;
}): Promise<QuickCreateCategoryResult> {
  const name = input.name.trim();
  if (!name) {
    return { success: false, error: "Nama kategori tidak boleh kosong." };
  }

  try {
    const userId = await getAuthenticatedUserId();

    // Fetch all user and system categories for this type (including archived)
    const { data: allCategories, error: fetchError } = await supabase
      .from("categories")
      .select("*")
      .or(`user_id.eq.${userId},is_system.eq.true`)
      .eq("category_type", input.categoryType);

    if (fetchError) {
      return { success: false, error: fetchError.message || "Gagal memeriksa kategori yang sudah ada." };
    }

    const normalizedInput = name.toLowerCase();
    const existing = (allCategories ?? []).find(
      (c) => c.name.trim().toLowerCase() === normalizedInput,
    );

    if (existing) {
      if (existing.is_archived) {
        return {
          success: false,
          error: `Kategori '${existing.name}' sudah ada tetapi diarsipkan.`,
          archivedCategory: existing,
        };
      }
      return {
        success: false,
        error: `Kategori '${existing.name}' sudah ada.`,
      };
    }

    const defaultIcon = input.icon || (input.categoryType === "income" ? "briefcase" : "utensils");
    const defaultColor = input.color || "#10B981";

    const { data: created, error: insertError } = await supabase
      .from("categories")
      .insert({
        user_id: userId,
        name,
        category_type: input.categoryType,
        icon: defaultIcon,
        color: defaultColor,
        is_system: false,
        is_archived: false,
      })
      .select("*")
      .single();

    if (insertError || !created) {
      return { success: false, error: insertError?.message || "Gagal membuat kategori baru." };
    }

    return { success: true, category: created };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan saat membuat kategori." };
  }
}
