import { UsersRound } from "lucide-react";
import { PagePlaceholder } from "../components/ui/PagePlaceholder";

export function SharedSavingsPage() {
  return (
    <PagePlaceholder
      title="Shared Savings"
      description="Foundation placeholder for Beta shared saving navigation. Verification and contribution logic are deferred."
      icon={UsersRound}
      sections={["Shared List", "Members", "Activity"]}
    />
  );
}
