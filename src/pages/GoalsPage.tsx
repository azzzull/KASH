import { PiggyBank } from "lucide-react";
import { PagePlaceholder } from "../components/ui/PagePlaceholder";

export function GoalsPage() {
  return (
    <PagePlaceholder
      title="Goals"
      description="Foundation placeholder for Beta savings goal navigation. Goal records and allocation logic are deferred."
      icon={PiggyBank}
      sections={["Goal List", "Progress Surface", "Contribution Entry"]}
    />
  );
}
