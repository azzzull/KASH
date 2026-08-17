import { HandCoins } from "lucide-react";
import { PagePlaceholder } from "../components/ui/PagePlaceholder";

export function DebtsPage() {
  return (
    <PagePlaceholder
      title="Debt & Receivable"
      description="Foundation placeholder for Beta debt and receivable navigation. Payment logic is deferred."
      icon={HandCoins}
      sections={["You Owe", "Owed to You", "Records"]}
    />
  );
}
