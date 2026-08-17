import type { Category } from "../types/domain";

export const KASH_CHART_COLORS = [
  "#10B981",
  "#F5B82E",
  "#22B8A7",
  "#4F7DF3",
  "#8B5CF6",
  "#F28C45",
  "#E50914",
  "#475569",
] as const;

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return hash;
}

function categoryColorKey(category: Category) {
  return `${category.category_type}:${category.name}:${category.id}`;
}

export function isApprovedChartColor(color: string | null | undefined) {
  return Boolean(color && KASH_CHART_COLORS.some((approvedColor) => approvedColor.toLowerCase() === color.toLowerCase()));
}

export function createCategoryColorResolver(categories: Category[]) {
  const sortedCategories = [...categories].sort((first, second) => categoryColorKey(first).localeCompare(categoryColorKey(second)));
  const colorByCategoryId = new Map<string, string>();
  const usedPaletteIndexes = new Set<number>();

  sortedCategories.forEach((category) => {
    const approvedColorIndex = isApprovedChartColor(category.color)
      ? KASH_CHART_COLORS.findIndex((color) => color.toLowerCase() === category.color?.toLowerCase())
      : -1;
    let paletteIndex = approvedColorIndex >= 0 ? approvedColorIndex : Math.abs(hashString(categoryColorKey(category))) % KASH_CHART_COLORS.length;

    if (usedPaletteIndexes.size < KASH_CHART_COLORS.length) {
      while (usedPaletteIndexes.has(paletteIndex)) {
        paletteIndex = (paletteIndex + 1) % KASH_CHART_COLORS.length;
      }
      usedPaletteIndexes.add(paletteIndex);
    }

    colorByCategoryId.set(category.id, KASH_CHART_COLORS[paletteIndex]);
  });

  return (category: Category | null | undefined) => {
    if (!category) return "#475569";
    return colorByCategoryId.get(category.id) ?? "#475569";
  };
}
