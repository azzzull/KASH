import type { Category } from "../types/domain";

/**
 * Curated, harmonious, modern, readable KASH chart palette for category composition.
 * Saturated yet muted, high contrast, and perfectly legible on white/light KASH UI.
 */
export const KASH_CATEGORY_PALETTE = [
  "#10B981", // Emerald
  "#3B82F6", // Modern Blue
  "#F59E0B", // Amber Gold
  "#8B5CF6", // Purple / Violet
  "#06B6D4", // Cyan
  "#F97316", // Bright Orange
  "#EC4899", // Rose / Pink
  "#6366F1", // Indigo
  "#14B8A6", // Teal
  "#84CC16", // Lime
  "#D97706", // Deep Ochre
  "#A855F7", // Bright Violet
] as const;

export const KASH_CHART_COLORS = KASH_CATEGORY_PALETTE;

/**
 * FNV-1a 32-bit stable hash function.
 */
function fnv1aHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Returns a 100% deterministic chart color for any category based on stable identity.
 * Same category ID or normalized name ALWAYS maps to the exact same color
 * regardless of array order, sorting, reload, or page context.
 */
export function getCategoryChartColor(
  category: { id?: string | null; name?: string | null; color?: string | null } | string | null | undefined,
): string {
  if (!category) return "#64748B"; // slate-500 fallback for uncategorized

  let identifier = "";
  if (typeof category === "string") {
    identifier = category;
  } else {
    if (category.id && category.id !== "uncategorized") {
      identifier = category.id;
    } else if (category.name) {
      identifier = category.name.trim().toLowerCase();
    }
  }

  if (!identifier || identifier === "uncategorized") {
    return "#64748B";
  }

  const hash = fnv1aHash(identifier);
  const paletteIndex = hash % KASH_CATEGORY_PALETTE.length;
  return KASH_CATEGORY_PALETTE[paletteIndex];
}

/**
 * Backward-compatible resolver factory returning the shared deterministic resolver.
 */
export function createCategoryColorResolver(_categories?: Category[]) {
  return (category: Category | null | undefined) => {
    return getCategoryChartColor(category);
  };
}

export function isApprovedChartColor(color: string | null | undefined) {
  return Boolean(
    color &&
      KASH_CATEGORY_PALETTE.some((approvedColor) => approvedColor.toLowerCase() === color.toLowerCase()),
  );
}
