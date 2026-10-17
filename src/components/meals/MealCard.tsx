"use client";
import { useState } from "react";
import { Clock3, Users, ChevronDown } from "lucide-react";
import type { Menu } from "@/lib/meals/planner";
import { Badge } from "../ui/shared";
import { IngredientChecklist } from "./IngredientChecklist";
import { DietaryCompatibility } from "./DietaryCompatibility";
export const menuLabel = (status: string) =>
  ({
    READY: "Ready to cook",
    REQUIRES_SHOPPING: "Requires shopping",
    NEEDS_CONFIRMATION: "Needs confirmation",
    REJECTED: "Not eligible",
  })[status] ?? status;
export function MealCard({
  menu,
  onSave,
  busy = false,
  saved = false,
}: {
  menu: Menu;
  onSave?: (acknowledge: boolean) => void;
  busy?: boolean;
  saved?: boolean;
}) {
  const [open, setOpen] = useState(saved);
  const [ack, setAck] = useState(false);
  return (
    <article className="card menu-card">
      <div className="section-heading">
        <Badge tone={menu.status === "READY" ? "green" : "amber"}>
          {menuLabel(menu.status)}
        </Badge>
        <span className="muted">
          {menu.dishes.length === 1 ? "Shared table" : "Two-dish menu"}
        </span>
      </div>
      <h2>{menu.dishes.map((d) => d.recipeName).join(" + ")}</h2>
      <div className="recipe-meta">
        <span>
          <Users size={15} />
          {menu.servings} servings
        </span>
        <span>
          <Clock3 size={15} />
          {menu.minutes} min total effort
        </span>
      </div>
      {menu.dishes.map((d) => (
        <div className="dish-allocation" key={d.recipeId}>
          <strong>{d.recipeName}</strong>
          <small>
            {d.servings} servings · {d.memberNames.join(", ")} ·{" "}
            {d.source.replaceAll("_", " ")}
          </small>
          <DietaryCompatibility result={d.verification} />
          {d.recipeSnapshot.advancePreparation && (
            <p className="info-strip">
              Prepare ahead: {d.recipeSnapshot.advancePreparation}
            </p>
          )}
        </div>
      ))}
      <ul className="reasons">
        {menu.explanations.slice(1).map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      <button className="text-button" onClick={() => setOpen(!open)}>
        <ChevronDown size={16} />
        {open ? "Hide" : "Show"} ingredient checklist, steps & score
      </button>
      {open && (
        <div className="menu-details">
          <IngredientChecklist check={menu.inventory} />
          {menu.dishes.map((d) => (
            <div key={d.recipeId}>
              <h3 className="form-section">Cook {d.recipeName}</h3>
              <ol className="instructions">
                {d.recipeSnapshot.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
          <details>
            <summary>How this menu is ranked</summary>
            <p className="muted">
              Score {(menu.scoring.score * 100).toFixed(1)} / 100; readiness and
              fewer dishes take precedence.
            </p>
            {Object.entries(menu.scoring.components).map(([key, value]) => (
              <p className="muted" key={key}>
                {key}: {(value * 100).toFixed(0)} / 100 (weight{" "}
                {menu.scoring.weights[
                  key as keyof typeof menu.scoring.weights
                ] * 100}
                %)
              </p>
            ))}
            {menu.scoring.notes.map((n) => (
              <p className="muted" key={n}>
                {n}
              </p>
            ))}
          </details>
        </div>
      )}
      {onSave && (
        <div className="save-plan">
          {menu.status !== "READY" && (
            <label className="check">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />{" "}
              I understand this plan needs shopping or confirmation before
              cooking.
            </label>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              menu.status === "REJECTED" ||
              (menu.status !== "READY" && !ack)
            }
            onClick={() => onSave(ack)}
          >
            {busy ? "Saving…" : "Save this meal plan"}
          </button>
        </div>
      )}
    </article>
  );
}
