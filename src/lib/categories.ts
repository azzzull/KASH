import type { Category, CategoryType } from "../types/domain";
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

export async function getUserCategories() {
  return supabase
    .from("categories")
    .select("*")
    .eq("is_system", false)
    .order("category_type", { ascending: true })
    .order("name", { ascending: true });
}

export async function getActiveCategories() {
  return supabase
    .from("categories")
    .select("*")
    .eq("is_archived", false)
    .order("category_type", { ascending: true })
    .order("name", { ascending: true });
}

export async function createCategory(input: CreateCategoryInput) {
  const userId = await getAuthenticatedUserId();

  return supabase
    .from("categories")
    .insert({
      user_id: userId,
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
