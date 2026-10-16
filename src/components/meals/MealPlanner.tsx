"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Search } from "lucide-react";
import type { Member } from "@/types";
import type { Menu } from "@/lib/meals/planner";
import type { PlanningRequest } from "@/lib/validation/planning";
import { mealTypes } from "@/lib/validation/planning";
import { api, Field, ErrorBox, Loading, Empty, Modal } from "../ui/shared";
import { MealCard, menuLabel } from "./MealCard";
import { RecipeGenerator } from "../recipes/RecipeGenerator";
import { RecipeSearchAutocomplete } from "../recipes/RecipeSearchAutocomplete";
export function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export type SavedPlan = {
  id: string;
  scheduledAt: string;
  mealType: string;
  status: string;
  stateVersion: number;
  createdAt: string;
  snapshot: { request: PlanningRequest; menu: Menu } | null;
  needsRecheck?: boolean;
};
type Recommendations = {
  menus: Menu[];
  excluded: { recipeId: string; name: string; reasons: string[] }[];
  unknownDish: string | null;
  stateVersion: number;
  message: string;
};
export function MealPlanner() {
  const [members, setMembers] = useState<Member[]>();
  const [request, setRequest] = useState<PlanningRequest>({
    date: localDate(),
    mealType: "dinner",
    memberIds: [],
    servings: 1,
    maxMinutes: 60,
    requestedDish: "",
  });
  const [results, setResults] = useState<Recommendations>();
  const [evaluated, setEvaluated] = useState<PlanningRequest>();
  const [saved, setSaved] = useState<SavedPlan[]>([]);
  const [opened, setOpened] = useState<SavedPlan>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [language, setLanguage] = useState("English");
  const [cuisine, setCuisine] = useState("Indian");
  const loadSaved = async () => setSaved(await api<SavedPlan[]>("meals"));
  useEffect(() => {
    Promise.all([api<Member[]>("members"), loadSaved()])
      .then(([m]) => {
        setMembers(m);
        const selected = m.filter((x) => x.active && x.participating);
        setRequest((r) => ({
          ...r,
          memberIds: selected.map((x) => x.id),
          servings: Math.max(1, selected.length),
        }));
      })
      .catch((e) => setError(e.message));
  }, []);
  function update<K extends keyof PlanningRequest>(
    key: K,
    value: PlanningRequest[K],
  ) {
    setRequest((r) => ({ ...r, [key]: value }));
    setResults(undefined);
    setEvaluated(undefined);
    setNotice("");
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            GOOD PLANS START WITH EVERYONE AT THE TABLE.
          </div>
          <h1>What’s cooking?</h1>
          <p>
            Local recipes first. Individual rules checked. Every ingredient
            accounted for.
          </p>
        </div>
        <CalendarDays size={30} />
      </div>
      <ErrorBox message={error} />
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      {!members ? (
        <Loading />
      ) : (
        <form
          className="card planner-controls"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const result = await api<Recommendations>(
                "meals/recommend",
                "POST",
                request,
              );
              setResults(result);
              setEvaluated({ ...request });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="planner-grid">
            <Field label="Meal">
              <select
                value={request.mealType}
                onChange={(e) =>
                  update(
                    "mealType",
                    e.target.value as PlanningRequest["mealType"],
                  )
                }
              >
                {mealTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Date">
              <input
                required
                type="date"
                value={request.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </Field>
            <Field label="Total servings">
              <input
                required
                type="number"
                min={Math.max(1, request.memberIds.length)}
                max={100}
                value={request.servings}
                onChange={(e) => update("servings", Number(e.target.value))}
              />
            </Field>
            <Field label="Max prep + cook minutes">
              <input
                required
                type="number"
                min={1}
                max={480}
                value={request.maxMinutes}
                onChange={(e) => update("maxMinutes", Number(e.target.value))}
              />
            </Field>
          </div>
          <h3 className="form-section">Who’s eating?</h3>
          <div className="participant-options">
            {members
              .filter((m) => m.active)
              .map((m) => (
                <label
                  key={m.id}
                  className={request.memberIds.includes(m.id) ? "selected" : ""}
                >
                  <input
                    type="checkbox"
                    checked={request.memberIds.includes(m.id)}
                    onChange={(e) => {
                      const ids = e.target.checked
                        ? [...request.memberIds, m.id]
                        : request.memberIds.filter((id) => id !== m.id);
                      update("memberIds", ids);
                      setRequest((r) => ({
                        ...r,
                        servings: Math.max(r.servings, ids.length),
                      }));
                    }}
                  />
                  <span>
                    <strong>{m.name}</strong>
                    <small>
                      {m.dietaryPreference}
                      {m.fasting ? " · fasting configured" : ""}
                    </small>
                  </span>
                </label>
              ))}
          </div>
          <div className="planner-grid secondary-controls">
            <Field label="Preferred dish (optional)">
              <RecipeSearchAutocomplete
                value={request.requestedDish}
                placeholder="Try Tadka Dal or your family’s favourite"
                onChange={(val) => update("requestedDish", val)}
                onSelect={(recipe) => update("requestedDish", recipe.name)}
              />
            </Field>
            <Field label="AI recipe language">
              <input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </Field>
            <Field label="Cuisine for an unknown dish">
              <input
                value={cuisine}
                onChange={(e) => setCuisine(e.target.value)}
              />
            </Field>
          </div>
          <div className="planner-action">
            <p className="muted">
              No stock is deducted. Unknown quantities require confirmation.
              Time estimates exclude advance soaking and marination.
            </p>
            <button
              className="button primary"
              disabled={busy || !request.memberIds.length}
            >
              <Search size={16} />
              {busy ? "Checking your kitchen…" : "Find meals"}
            </button>
          </div>
        </form>
      )}
      {results && evaluated && (
        <section className="recommendations">
          <div className="section-heading">
            <h2>Your meal options</h2>
            <span className="muted">
              {results.menus.length} menus · household state{" "}
              {results.stateVersion}
            </span>
          </div>
          <p className="muted">{results.message}</p>
          {results.unknownDish && (
            <RecipeGenerator
              key={JSON.stringify(evaluated) + language + cuisine}
              request={{
                dishName: results.unknownDish,
                servings: evaluated.servings,
                memberIds: evaluated.memberIds,
                date: evaluated.date,
                mealType: evaluated.mealType,
                maxMinutes: evaluated.maxMinutes,
                preferredLanguage: language,
                cuisine,
              }}
              onSaved={() =>
                setNotice(
                  "Recipe library updated. Click Find meals to re-evaluate.",
                )
              }
            />
          )}
          <div className="menu-grid">
            {results.menus.map((menu) => (
              <MealCard
                key={menu.id}
                menu={menu}
                busy={busy}
                onSave={async (acknowledge) => {
                  setBusy(true);
                  setError("");
                  try {
                    const meal = await api<SavedPlan>("meals", "POST", {
                      request: evaluated,
                      dishes: menu.dishes.map((d) => ({
                        recipeId: d.recipeId,
                        memberIds: d.memberIds,
                        servings: d.servings,
                      })),
                      stateVersion: menu.stateVersion,
                      acknowledgeUncertainty: acknowledge,
                    });
                    setOpened(meal);
                    setNotice(
                      "Meal plan saved with its decision snapshot. Inventory is unchanged.",
                    );
                    setResults(undefined);
                    await loadSaved();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ))}
          </div>
          {!results.menus.length && !results.unknownDish && (
            <Empty>
              No plan can be recommended with the current constraints. The
              exclusions below explain why.
            </Empty>
          )}
          {results.excluded.length > 0 && (
            <details className="card exclusions">
              <summary>
                Why other shared dishes were excluded ({results.excluded.length}
                )
              </summary>
              {results.excluded.map((r) => (
                <div key={r.recipeId}>
                  <h3>{r.name}</h3>
                  <ul>
                    {r.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          )}
        </section>
      )}
      <section className="saved-plans">
        <div className="section-heading">
          <h2>Your saved meals</h2>
          <small>
            Snapshots retain the reasons and quantities at selection time.
          </small>
        </div>
        {!saved.length ? (
          <Empty>No saved plans yet. Find a meal to get started.</Empty>
        ) : (
          saved.map((p) => (
            <button
              className="saved-plan-row"
              key={p.id}
              onClick={async () => {
                setError("");
                try {
                  setOpened(await api<SavedPlan>(`meals/${p.id}`));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <div>
                <strong>
                  {p.scheduledAt.slice(0, 10)} · {p.mealType}
                </strong>
                <small>
                  {p.snapshot?.menu.dishes
                    .map((d) => d.recipeName)
                    .join(" + ") || "Legacy plan"}
                </small>
              </div>
              <span>{menuLabel(p.status)} at save</span>
            </button>
          ))
        )}
      </section>
      {opened && (
        <Modal
          title={`Saved ${opened.mealType} · ${opened.scheduledAt.slice(0, 10)}`}
          onClose={() => setOpened(undefined)}
        >
          <p className="info-strip">
            This is a decision snapshot, not live stock.{" "}
            {opened.needsRecheck
              ? "Household data has changed since selection. Re-run Find meals before cooking."
              : "Recheck stock and restrictions before cooking; automatic replanning is deferred."}
          </p>
          {opened.snapshot ? (
            <MealCard menu={opened.snapshot.menu} saved />
          ) : (
            <Empty>This legacy plan has no Phase 2 decision snapshot.</Empty>
          )}
        </Modal>
      )}
    </>
  );
}
