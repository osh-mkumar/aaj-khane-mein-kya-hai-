import { GroceryGapsView } from "@/components/groceries/GroceryGapsView";

export const metadata = {
  title: "Grocery Gaps · RasoiOS",
  description: "View aggregated ingredient shortfalls and pantry gaps across all planned household meals.",
};

export default function GroceriesPage() {
  return <GroceryGapsView />;
}
