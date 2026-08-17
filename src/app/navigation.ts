import {
    BarChart3,
    Bell,
    CalendarDays,
    CreditCard,
    HandCoins,
    Home,
    LucideIcon,
    ReceiptText,
    Settings,
    Crosshair,
    UsersRound,
    WalletCards,
} from "lucide-react";

export type NavItem = {
    label: string;
    path: string;
    icon: LucideIcon;
};

export type NavGroup = {
    label: string;
    items: NavItem[];
};

export const navGroups: NavGroup[] = [
    {
        label: "Overview",
        items: [
            { label: "Dashboard", path: "/dashboard", icon: Home },
            { label: "Transactions", path: "/transactions", icon: ReceiptText },
            { label: "Calendar", path: "/calendar", icon: CalendarDays },
            { label: "Analytics", path: "/analytics", icon: BarChart3 },
        ],
    },
    {
        label: "Finance",
        items: [
            { label: "Wallets", path: "/wallets", icon: WalletCards },
            { label: "Goals", path: "/goals", icon: Crosshair },
            { label: "Shared Savings", path: "/shared", icon: UsersRound },
            { label: "Debt & Receivable", path: "/debts", icon: HandCoins },
        ],
    },
    {
        label: "Account",
        items: [{ label: "Settings", path: "/settings", icon: Settings }],
    },
];

export const mobilePrimaryItems: NavItem[] = [
    { label: "Home", path: "/dashboard", icon: Home },
    { label: "Transactions", path: "/transactions", icon: ReceiptText },
    { label: "Analytics", path: "/analytics", icon: BarChart3 },
];

export const mobileMoreItems: NavItem[] = [
    { label: "Wallets", path: "/wallets", icon: WalletCards },
    { label: "Calendar", path: "/calendar", icon: CalendarDays },
    { label: "Goals", path: "/goals", icon: Crosshair },
    { label: "Shared Savings", path: "/shared", icon: UsersRound },
    { label: "Debt & Receivable", path: "/debts", icon: CreditCard },
    { label: "Settings", path: "/settings", icon: Settings },
];

export const utilityItems: NavItem[] = [
    { label: "Notifications", path: "/notifications", icon: Bell },
];
