"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Badge, ErrorBox } from "../ui/shared";
import { localDate, type SavedPlan } from "./MealPlanner";
import { menuLabel } from "./MealCard";
import { IngredientChecklist } from "./IngredientChecklist";
export function TodayMeal() {
  const [plans, setPlans] = useState<SavedPlan[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    api<SavedPlan[]>(`meals?date=${localDate()}`)
      .then(setPlans)
      .catch((e) => setError(e.message));
  }, []);
  const current = plans?.filter(
    (p, i, a) => a.findIndex((x) => x.mealType === p.mealType) === i,
  );
  return (
    <section className="card today-meals">
      <div className="section-heading">
        <h2>Today at your table</h2>
        <Link href="/meal-planner">Plan a meal →</Link>
      </div>
      <ErrorBox message={error} />
      {!plans ? (
        <p className="muted">Loading saved meals…</p>
      ) : !current?.length ? (
        <p className="muted">
          No meals saved for today. Choose participants and find a plan that
          fits.
        </p>
      ) : (
        current.map((p) => (
          <div key={p.id}>
            <div className="tags">
              <Badge>{p.mealType}</Badge>
              <Badge tone="neutral">{menuLabel(p.status)} at selection</Badge>
            </div>
            <h3>
              {p.snapshot?.menu.dishes.map((d) => d.recipeName).join(" + ") ||
                "Saved meal"}
            </h3>
            <p className="muted">
              Saved decision snapshot. Recheck current inventory before cooking.
            </p>
            {p.snapshot && (
              <details>
                <summary>Ingredient requirements</summary>
                <IngredientChecklist check={p.snapshot.menu.inventory} />
              </details>
            )}
          </div>
        ))
      )}
    </section>
  );
}
