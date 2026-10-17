import { getRecipes, ApiError, log, recipeInclude } from "../db/service";
import { db, HOUSEHOLD_ID } from "../db";
import { normalizeDish } from "./aliases";
export type ResolvedRecipe = Awaited<ReturnType<typeof getRecipes>>[number];
export function preferredRecipes(recipes: ResolvedRecipe[]): ResolvedRecipe[] {
  const overrides = new Map(
    recipes
      .filter((r) => r.custom?.preferred)
      .map((r) => [r.custom!.originalRecipeId, r]),
  );
  return recipes
    .filter((r) => r.source !== "HOUSEHOLD_CUSTOM")
    .map((r) => overrides.get(r.id) ?? r)
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function resolveFromRecipes(name: string, recipes: ResolvedRecipe[]) {
  const key = normalizeDish(name);
  const bases = recipes.filter((r) => r.source !== "HOUSEHOLD_CUSTOM");
  const base = bases.find(
    (r) =>
      normalizeDish(r.name) === key ||
      normalizeDish(r.id) === key ||
      r.generation?.requestedDish === key,
  );
  const custom = recipes.find(
    (r) =>
      r.custom?.preferred &&
      (r.custom.originalRecipeId === base?.id || normalizeDish(r.name) === key),
  );
  return custom ?? base ?? null;
}
export async function resolveRecipe(name: string) {
  const recipe = resolveFromRecipes(name, await getRecipes());
  return {
    recipe,
    found: !!recipe,
    canGenerate: !recipe,
    aiConfigured: !!process.env.OPENAI_API_KEY,
    explanation: recipe
      ? `Using ${recipe.source === "HOUSEHOLD_CUSTOM" ? "your preferred household version" : recipe.source === "LOCAL" ? "a local recipe" : "a previously saved AI recipe"}.`
      : "Recipe not found locally. You can explicitly generate a draft with AI.",
  };
}
export async function resetRecipe(id: string) {
  return db.$transaction(async (tx) => {
    const override = await tx.householdRecipeOverride.findFirst({
      where: { recipeId: id, householdId: HOUSEHOLD_ID },
    });
    if (!override) throw new ApiError(404, "Household recipe not found");
    await tx.householdRecipeOverride.update({
      where: { id: override.id },
      data: { preferred: false },
    });
    await log(
      tx,
      "CUSTOM_RECIPE_RESET",
      id,
      "Original recipe restored as preferred; the household copy is retained.",
    );
    return tx.recipe.findUniqueOrThrow({
      where: { id: override.originalRecipeId },
      include: recipeInclude,
    });
  });
}
