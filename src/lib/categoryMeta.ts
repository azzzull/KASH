import {
  Briefcase,
  Bus,
  Circle,
  Gift,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Laptop,
  Plane,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Store,
  Ticket,
  TrendingUp,
  Utensils,
  Users,
} from "lucide-react";

export const categoryColors = ["#10B981", "#E50914", "#FBBF24", "#4F7DF3", "#8B5CF6", "#22B8A7", "#91A3BB"] as const;

export const categoryIconOptions = [
  { value: "utensils", label: "Food", icon: Utensils },
  { value: "bus", label: "Transport", icon: Bus },
  { value: "shopping-bag", label: "Shopping", icon: ShoppingBag },
  { value: "receipt", label: "Bills", icon: Receipt },
  { value: "briefcase", label: "Work", icon: Briefcase },
  { value: "laptop", label: "Freelance", icon: Laptop },
  { value: "store", label: "Business", icon: Store },
  { value: "gift", label: "Gift", icon: Gift },
  { value: "trending-up", label: "Investment", icon: TrendingUp },
  { value: "rotate-ccw", label: "Refund", icon: RotateCcw },
  { value: "heart-pulse", label: "Health", icon: HeartPulse },
  { value: "graduation-cap", label: "Education", icon: GraduationCap },
  { value: "sparkles", label: "Lifestyle", icon: Sparkles },
  { value: "ticket", label: "Entertainment", icon: Ticket },
  { value: "plane", label: "Travel", icon: Plane },
  { value: "users", label: "Family", icon: Users },
  { value: "hand-heart", label: "Donation", icon: HandHeart },
  { value: "circle", label: "Other", icon: Circle },
] as const;

export function getCategoryIcon(iconKey: string | null | undefined) {
  return categoryIconOptions.find((option) => option.value === iconKey)?.icon ?? Circle;
}

export function isAllowedCategoryColor(color: string) {
  return categoryColors.some((value) => value === color);
}
