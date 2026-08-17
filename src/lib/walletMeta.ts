import {
  Banknote,
  Building2,
  CircleDollarSign,
  Landmark,
  LucideIcon,
  PiggyBank,
  Smartphone,
  Wallet,
} from "lucide-react";
import type { WalletType } from "../types/domain";

export type WalletTypeOption = {
  value: WalletType;
  label: string;
  group: string;
  needsInstitution: boolean;
  icon: LucideIcon;
};

export const walletTypeOptions: WalletTypeOption[] = [
  { value: "bank", label: "Bank", group: "Bank Accounts", needsInstitution: true, icon: Landmark },
  { value: "digital_bank", label: "Digital Bank", group: "Bank Accounts", needsInstitution: true, icon: Building2 },
  { value: "ewallet", label: "E-Wallet", group: "E-Wallets", needsInstitution: true, icon: Smartphone },
  { value: "cash", label: "Cash", group: "Cash", needsInstitution: false, icon: Banknote },
  { value: "investment", label: "Investment", group: "Investments", needsInstitution: true, icon: CircleDollarSign },
  { value: "savings", label: "Savings", group: "Savings", needsInstitution: true, icon: PiggyBank },
  { value: "custom", label: "Custom", group: "Custom", needsInstitution: true, icon: Wallet },
];

export const walletColors = ["#10B981", "#FBBF24", "#4F7DF3", "#8B5CF6", "#22B8A7", "#91A3BB"] as const;

export const walletIconOptions = [
  { value: "landmark", label: "Bank", icon: Landmark },
  { value: "smartphone", label: "E-Wallet", icon: Smartphone },
  { value: "banknote", label: "Cash", icon: Banknote },
  { value: "piggy-bank", label: "Savings", icon: PiggyBank },
  { value: "circle-dollar-sign", label: "Investment", icon: CircleDollarSign },
  { value: "wallet", label: "Wallet", icon: Wallet },
] as const;

export function getWalletTypeOption(type: WalletType) {
  return walletTypeOptions.find((option) => option.value === type) ?? walletTypeOptions[0];
}

export function getWalletIcon(iconKey: string | null | undefined, type: WalletType) {
  return walletIconOptions.find((option) => option.value === iconKey)?.icon ?? getWalletTypeOption(type).icon;
}

export function isLiquidWallet(type: WalletType) {
  return type === "bank" || type === "digital_bank" || type === "ewallet" || type === "cash";
}
