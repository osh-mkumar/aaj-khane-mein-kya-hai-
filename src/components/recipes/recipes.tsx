"use client";
import { RecipeAnalysis } from "./RecipeAnalysis";
import { useEffect, useState } from "react";
import {
  Search,
  Clock3,
  Users,
  ArrowUpRight,
  BookOpen,
  Copy,
  Plus,
  Trash2,
  ChefHat,
  PlayCircle,
} from "lucide-react";
import { CookMode } from "./CookMode";
import { RecipeSearchAutocomplete } from "./RecipeSearchAutocomplete";
import type { Recipe, Ingredient } from "@/types";
import { units } from "@/lib/validation";
import {
  api,
  Modal,
  Field,
  Badge,
  Loading,
  ErrorBox,
  Empty,
  asList,
} from "../ui/shared";
function RecipeEditor({
  recipe,
  ingredients,
  onClose,
  onSave,
}: {
  recipe: Recipe;
  ingredients: Ingredient[];
  onClose: () => void;
  onSave: (r: Recipe) => Promise<void>;
}) {
  const custom = recipe.source === "HOUSEHOLD_CUSTOM";
  const [name, setName] = useState(
    custom ? recipe.name : `${recipe.name} · Our way`,
  );
  const [description, setDescription] = useState(recipe.description);
  const [servings, setServings] = useState(recipe.defaultServings);
  const [items, setItems] = useState(
    recipe.ingredients.map((i) => ({
      ingredientId: i.ingredientId,
      quantity: i.quantity,
      unit: i.unit,
    })),
  );
  const [steps, setSteps] = useState(recipe.instructions.map((i) => i.text));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={custom ? "Edit your family’s recipe" : "Make this recipe your own"}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await api<Recipe>(
              `recipes/custom${custom ? "/" + recipe.id : ""}`,
              custom ? "PATCH" : "POST",
              {
                originalRecipeId: recipe.custom?.originalRecipeId ?? recipe.id,
                name,
                description,
                defaultServings: servings,
                ingredients: items,
                instructions: steps,
              },
            );
            await onSave(r);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="info-strip">
          The original recipe stays intact. Your household version becomes the
          preferred copy.
        </div>
        <div className="form-grid">
          <Field label="Recipe name">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Servings">
            <input
              required
              type="number"
              min="1"
              max="100"
              value={servings}
              onChange={(e) => setServings(Number(e.target.value))}
            />
          </Field>
          <Field label="Description" wide>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
        <h3 className="form-section">Ingredients</h3>
        {items.map((item, index) => (
          <div className="ingredient-edit" key={index}>
            <select
              aria-label={`Ingredient ${index + 1}`}
              value={item.ingredientId}
              onChange={(e) =>
                setItems((a) =>
                  a.map((v, i) =>
                    i === index ? { ...v, ingredientId: e.target.value } : v,
                  ),
                )
              }
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <input
              aria-label={`Quantity ${index + 1}`}
              required
              type="number"
              min="0.001"
              step="any"
              value={item.quantity}
              onChange={(e) =>
                setItems((a) =>
                  a.map((v, i) =>
                    i === index
                      ? { ...v, quantity: Number(e.target.value) }
                      : v,
                  ),
                )
              }
            />
            <select
              aria-label={`Unit ${index + 1}`}
              value={item.unit}
              onChange={(e) =>
                setItems((a) =>
                  a.map((v, i) =>
                    i === index ? { ...v, unit: e.target.value } : v,
                  ),
                )
              }
            >
              {units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <button
              type="button"
              className="icon-button danger-text"
              aria-label={`Remove ingredient ${index + 1}`}
              onClick={() => setItems((a) => a.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const next = ingredients.find(
              (i) => !items.some((v) => v.ingredientId === i.id),
            );
            if (next)
              setItems((a) => [
                ...a,
                { ingredientId: next.id, quantity: 1, unit: "g" },
              ]);
          }}
        >
          <Plus size={15} /> Add ingredient
        </button>
        <p className="muted">
          Change quantities to match any new unit. Add new canonical ingredients
          through Kitchen Inventory.
        </p>
        <h3 className="form-section">Cooking steps</h3>
        {steps.map((step, index) => (
          <div className="step-edit" key={index}>
            <span>{index + 1}</span>
            <textarea
              required
              aria-label={`Cooking step ${index + 1}`}
              value={step}
              onChange={(e) =>
                setSteps((a) =>
                  a.map((s, i) => (i === index ? e.target.value : s)),
                )
              }
            />
            <button
              type="button"
              className="icon-button danger-text"
              aria-label={`Remove step ${index + 1}`}
              onClick={() => setSteps((a) => a.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() => setSteps((a) => [...a, ""])}
        >
          <Plus size={15} /> Add step
        </button>
        <ErrorBox message={error} />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save household version"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function RecipeLibrary() {
  const [recipes, setRecipes] = useState<Recipe[]>();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [selected, setSelected] = useState<Recipe>();
  const [editing, setEditing] = useState<Recipe>();
  const [cookingRecipe, setCookingRecipe] = useState<Recipe | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(false);
  async function load() {
    const [r, i] = await Promise.all([
      api<Recipe[]>("recipes"),
      api<Ingredient[]>("ingredients"),
    ]);
    setRecipes(r);
    setIngredients(i);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const shown = recipes?.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || r.source === filter),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FAMILIAR FLAVOURS. YOUR FAMILY’S WAY.</div>
          <h1>Recipe library</h1>
          <p>A starting point for meals that become your own.</p>
        </div>
        <Badge tone="cream">
          <BookOpen size={15} /> 15 local favourites
        </Badge>
      </div>
      <ErrorBox message={error} />
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      <div className="recipe-banner">
        <div>
          <ChefHat size={27} />
          <h2>“At our home, we make it a little differently.”</h2>
          <p>
            Save your ingredients, quantities and cooking steps. Keep the family
            version.
          </p>
        </div>
        <span className="recipe-banner-mark" aria-hidden="true">
          घर का स्वाद
        </span>
      </div>
      <div className="toolbar recipe-toolbar">
        <div className="tabs">
          {[
            ["all", "All recipes"],
            ["LOCAL", "Local favourites"],
            ["HOUSEHOLD_CUSTOM", "Our family’s versions"],
            ["AI_GENERATED", "AI recipes"],
          ].map(([v, label]) => (
            <button
              key={v}
              className={filter === v ? "selected" : ""}
              onClick={() => setFilter(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <RecipeSearchAutocomplete
          value={query}
          onChange={setQuery}
          onSelect={(recipe) => {
            if (filter !== "all" && recipe.source !== filter) {
              setFilter("all");
            }
            setSelected(recipe);
          }}
          recipes={recipes}
          placeholder="Find a favourite…"
        />
      </div>
      {!recipes ? (
        <Loading />
      ) : !shown?.length ? (
        <Empty>
          {filter === "HOUSEHOLD_CUSTOM"
            ? "Your family recipe book starts here. Open a local recipe and make a household copy."
            : "No matching recipes."}
        </Empty>
      ) : (
        <div className="recipe-grid">
          {shown.map((r, i) => (
            <button
              key={r.id}
              className="recipe-card"
              onClick={() => setSelected(r)}
            >
              <div className={`recipe-art recipe-art-${i % 5}`}>
                <div className="mini-plate">
                  <div className="mini-food" />
                </div>
                <span className="recipe-category">{r.mealCategory}</span>
                {r.source === "HOUSEHOLD_CUSTOM" && (
                  <span className="custom-ribbon">OUR WAY</span>
                )}
                {r.source === "MENDELEY" && (
                  <span className="custom-ribbon" style={{ background: "#0369a1" }}>MENDELEY</span>
                )}
              </div>
              <div className="recipe-body">
                <div className="recipe-title">
                  <h2>{r.name}</h2>
                  <ArrowUpRight size={18} />
                </div>
                <p>{r.description}</p>
                {typeof r.dietaryMetadata === "object" &&
                  r.dietaryMetadata !== null &&
                  "isComplete" in r.dietaryMetadata &&
                  (r.dietaryMetadata as Record<string, unknown>).isComplete === false && (
                    <div style={{ margin: "4px 0" }}>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#92400e", background: "#fef3c7", padding: "2px 8px", borderRadius: "4px" }}>
                        Incomplete record · Inspiration only
                      </span>
                    </div>
                  )}
                <div className="recipe-meta">
                  <span>
                    <Clock3 size={14} />
                    {r.prepMinutes + r.cookMinutes} min
                  </span>
                  <span>
                    <Users size={14} />
                    {r.defaultServings} servings
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="page-note">
        Recipe labels are descriptive, not a dietary safety check. Review all
        ingredients against individual allergies, Jain and fasting rules.
      </p>
      {selected && !editing && (
        <Modal title={selected.name} onClose={() => setSelected(undefined)}>
          <div className="tags">
            <Badge>
              {selected.source === "LOCAL"
                ? "Local recipe"
                : selected.source === "MENDELEY"
                  ? "Mendeley Indian Dataset"
                  : selected.source === "AI_GENERATED"
                    ? "AI-generated recipe"
                    : selected.custom?.preferred
                      ? "Preferred household version"
                      : "Retained household version"}
            </Badge>
            {typeof selected.dietaryMetadata === "object" &&
              selected.dietaryMetadata !== null &&
              "isComplete" in selected.dietaryMetadata &&
              (selected.dietaryMetadata as Record<string, unknown>).isComplete === false && (
                <Badge tone="cream">
                  ⚠️ Incomplete dataset record · Inspiration only
                </Badge>
              )}
            <Badge tone="neutral">{selected.defaultServings} servings</Badge>
            <Badge tone="neutral">
              Prep {selected.prepMinutes} min · Cook {selected.cookMinutes} min
            </Badge>
          </div>
          <p>{selected.description}</p>
          <div className="tags">
            {asList(selected.dietaryMetadata).map((t) => (
              <Badge key={t} tone="neutral">
                {t}
              </Badge>
            ))}
          </div>
          <p className="muted">
            Review actual ingredients against household rules; metadata may
            reflect the original recipe.
          </p>
          {selected.advancePreparation && (
            <div className="info-strip">
              <Clock3 size={19} />
              <span>
                <strong>Plan ahead:</strong> {selected.advancePreparation}
              </span>
            </div>
          )}
          <h3 className="form-section">What goes in</h3>
          <div className="recipe-ingredients">
            {selected.ingredients.map((i) => (
              <div key={i.id}>
                <span>{i.ingredient.name}</span>
                <strong>
                  {i.quantity} {i.unit}
                </strong>
              </div>
            ))}
          </div>
          <h3 className="form-section">Let’s make it</h3>
          <ol className="instructions">
            {selected.instructions.map((i) => (
              <li key={i.id}>{i.text}</li>
            ))}
          </ol>
          {asList(selected.substitutions).length > 0 && (
            <p className="info-strip">
              Optional swaps: {asList(selected.substitutions).join(" ")}
            </p>
          )}
          <RecipeAnalysis
            key={selected.id + selected.updatedAt}
            recipeId={selected.id}
            baseServings={selected.defaultServings}
          />
          {selected.custom && (
            <div className="card-actions">
              <button
                onClick={() => {
                  const original = recipes?.find(
                    (r) => r.id === selected.custom?.originalRecipeId,
                  );
                  if (original) setSelected(original);
                }}
              >
                View original recipe
              </button>
              <button
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);
                  try {
                    const original = await api<Recipe>(
                      `recipes/reset/${selected.id}`,
                      "POST",
                      { confirmed: true },
                    );
                    await load();
                    setSelected(original);
                    setNotice(
                      "Original restored as preferred. Your household copy is retained.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                Use original by default
              </button>
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setSelected(undefined)}
            >
              Close
            </button>
            <button
              className="button secondary"
              style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}
              onClick={() => {
                setCookingRecipe(selected);
                setSelected(undefined);
              }}
            >
              <PlayCircle size={16} /> Cook Mode
            </button>
            <button
              className="button primary"
              onClick={() => {
                const existing = recipes?.find(
                  (r) => r.custom?.originalRecipeId === selected.id,
                );
                setEditing(existing ?? selected);
              }}
            >
              <Copy size={16} />
              {selected.source === "HOUSEHOLD_CUSTOM"
                ? "Edit household version"
                : recipes?.some(
                      (r) => r.custom?.originalRecipeId === selected.id,
                    )
                  ? "Edit saved household version"
                  : "Make a household copy"}
            </button>
          </div>
        </Modal>
      )}
      {cookingRecipe && (
        <Modal
          title={`Cooking Assistant: ${cookingRecipe.name}`}
          onClose={() => setCookingRecipe(null)}
        >
          <CookMode
            recipe={cookingRecipe}
            onClose={() => setCookingRecipe(null)}
          />
        </Modal>
      )}
      {editing && (
        <RecipeEditor
          recipe={editing}
          ingredients={ingredients}
          onClose={() => setEditing(undefined)}
          onSave={async (r) => {
            await load();
            setSelected(r);
            setNotice(
              "Household version saved. The original recipe is preserved.",
            );
          }}
        />
      )}
    </>
  );
}
