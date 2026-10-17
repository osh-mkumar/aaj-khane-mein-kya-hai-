"use client";
import { useEffect, useState } from "react";
import type { Member } from "@/types";
import type { Verification } from "@/lib/dietary/verifier";
import type { InventoryCheck } from "@/lib/inventory/availability";
import { api, Field, ErrorBox } from "../ui/shared";
import { localDate } from "../meals/MealPlanner";
import { IngredientChecklist } from "../meals/IngredientChecklist";
import { DietaryCompatibility } from "../meals/DietaryCompatibility";
import { mealTypes } from "@/lib/validation/planning";
export function RecipeAnalysis({
  recipeId,
  baseServings,
}: {
  recipeId: string;
  baseServings: number;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [servings, setServings] = useState(baseServings);
  const [date, setDate] = useState(localDate());
  const [mealType, setMealType] = useState("dinner");
  const [verification, setVerification] = useState<Verification>();
  const [check, setCheck] = useState<InventoryCheck>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Member[]>("members")
      .then((m) => {
        setMembers(m.filter((i) => i.active));
        setIds(m.filter((i) => i.active && i.participating).map((i) => i.id));
      })
      .catch((e) => setError(e.message));
  }, []);
  function clear() {
    setVerification(undefined);
    setCheck(undefined);
  }
  return (
    <section className="recipe-analysis">
      <h3 className="form-section">Check this recipe for your table</h3>
      <div className="planner-grid">
        <Field label={`Servings (base ${baseServings})`}>
          <input
            type="number"
            min={1}
            max={100}
            value={servings}
            onChange={(e) => {
              setServings(Number(e.target.value));
              clear();
            }}
          />
        </Field>
        <Field label="Meal date">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              clear();
            }}
          />
        </Field>
        <Field label="Meal">
          <select
            value={mealType}
            onChange={(e) => {
              setMealType(e.target.value);
              clear();
            }}
          >
            {mealTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="participant-options compact">
        {members.map((m) => (
          <label key={m.id}>
            <input
              type="checkbox"
              checked={ids.includes(m.id)}
              onChange={(e) => {
                setIds((a) =>
                  e.target.checked
                    ? [...a, m.id]
                    : a.filter((id) => id !== m.id),
                );
                clear();
              }}
            />
            {m.name}
          </label>
        ))}
      </div>
      <button
        className="button secondary"
        disabled={busy || !ids.length}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const [v, c] = await Promise.all([
              api<Verification>("recipes/verify", "POST", {
                recipeId,
                memberIds: ids,
                date,
                mealType,
              }),
              api<InventoryCheck>("ingredients/check", "POST", {
                dishes: [{ recipeId, servings, memberIds: ids }],
                date,
              }),
            ]);
            setVerification(v);
            setCheck(c);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking…" : "Scale ingredients & verify participants"}
      </button>
      <ErrorBox message={error} />
      {verification && <DietaryCompatibility result={verification} />}{" "}
      {check && <IngredientChecklist check={check} />}
      <p className="muted">
        Fractional pieces are preserved; displayed quantities round to two
        decimals. Product labels and preparation still require review.
      </p>
    </section>
  );
}
