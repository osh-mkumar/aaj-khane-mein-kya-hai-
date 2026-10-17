"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { GenerationRequest } from "@/lib/validation/planning";
import type { RecipeDraft } from "@/lib/recipes/generator";
import type { Recipe } from "@/types";
import { api, ErrorBox, Badge } from "../ui/shared";
import { DietaryCompatibility } from "../meals/DietaryCompatibility";
export function RecipeGenerator({
  request,
  onSaved,
}: {
  request: GenerationRequest;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<RecipeDraft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  return (
    <section className="card ai-panel">
      <Sparkles size={24} />
      <h2>Recipe not found locally — generate with AI</h2>
      <p>
        Generate “{request.dishName}” as a reviewable draft. Only this explicit
        action calls OpenAI. Rule values and pantry ingredients are sent; names
        and relationship labels are omitted.
      </p>
      <ErrorBox message={error} />
      {notice && <p role="status">{notice}</p>}
      {!draft ? (
        <button
          className="button primary"
          disabled={busy || !request.memberIds.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await api<{
                draft: RecipeDraft | null;
                existingRecipe: Recipe | null;
              }>("recipes/generate", "POST", request);
              if (result.draft) setDraft(result.draft);
              else {
                setNotice(
                  "A matching recipe is already saved. Find meals again to use it.",
                );
                onSaved();
              }
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Generating a draft…" : "Generate recipe with AI"}
        </button>
      ) : (
        <>
          <div className="tags">
            <Badge tone="amber">AI GENERATED · UNSAVED DRAFT</Badge>
            <Badge tone="neutral">
              {draft.recipe.defaultServings} servings
            </Badge>
          </div>
          <h3>{draft.recipe.name}</h3>
          <p>{draft.recipe.description}</p>
          <p className="muted">
            Prep {draft.recipe.prepMinutes} min · Cook{" "}
            {draft.recipe.cookMinutes} min ·{" "}
            {draft.recipe.advancePreparation ||
              "No advance preparation specified"}
          </p>
          <div className="recipe-ingredients">
            {draft.recipe.ingredients.map((i) => (
              <div key={i.ingredientId}>
                <span>
                  {i.name}
                  {i.uncertain ? " · review" : ""}
                </span>
                <strong>
                  {i.quantity ?? "Unknown"} {i.unit}
                </strong>
              </div>
            ))}
          </div>
          <ol className="instructions">
            {draft.recipe.instructions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <DietaryCompatibility result={draft.verification} />
          {draft.warnings.length > 0 && (
            <div className="error">
              {draft.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
              <p>
                Unresolved drafts cannot be saved. Discard and request a clearer
                recipe.
              </p>
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("recipes/generated/discard", "POST", {
                    token: draft.token,
                  });
                  setDraft(undefined);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Discard draft
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                draft.verification.status !== "VERIFIED" ||
                draft.warnings.length > 0
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await api("recipes/generated/save", "POST", {
                    token: draft.token,
                    confirmed: true,
                  });
                  setNotice(
                    "Reviewed recipe saved. Find meals again to calculate servings and inventory.",
                  );
                  setDraft(undefined);
                  onSaved();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              I reviewed this recipe — save
            </button>
          </div>
        </>
      )}
    </section>
  );
}
