import { verifyRecipe, type DietaryMember } from "../dietary/verifier";
import { scaleRecipe } from "../recipes/scaler";
import { aggregateRequirements } from "../groceries/aggregator";
import { compareInventory, type Stock } from "../inventory/availability";
import {
  preferredRecipes,
  resolveFromRecipes,
  type ResolvedRecipe,
} from "../recipes/resolver";
import { scoreMenu } from "./scoring";
import type { PlanningRequest, DishSelection } from "../validation/planning";
export type PlanningData = {
  recipes: ResolvedRecipe[];
  members: (DietaryMember & { active: boolean })[];
  inventory: Stock[];
  stateVersion: number;
  recentRecipeIds: string[];
};
export function evaluateMenu(
  request: PlanningRequest,
  selections: DishSelection[],
  data: PlanningData,
) {
  const selected = data.members.filter((m) => request.memberIds.includes(m.id));
  if (
    selected.length !== request.memberIds.length ||
    selected.some((m) => !m.active)
  )
    throw new Error("Select active members belonging to this household");
  const assignments = selections.flatMap((d) => d.memberIds);
  if (
    assignments.length !== new Set(assignments).size ||
    assignments.length !== request.memberIds.length ||
    assignments.some((id) => !request.memberIds.includes(id))
  )
    throw new Error("Every participant must be assigned to exactly one dish");
  if (selections.reduce((sum, d) => sum + d.servings, 0) !== request.servings)
    throw new Error("Dish servings must add up to the requested total");
  if (new Set(selections.map((d) => d.recipeId)).size !== selections.length)
    throw new Error("Combine duplicate dishes into one serving allocation");
  const dishes = selections.map((selection) => {
    const recipe = data.recipes.find((r) => r.id === selection.recipeId);
    if (!recipe) throw new Error("Recipe not found in household library");
    if (selection.servings < selection.memberIds.length)
      throw new Error(
        "Each dish needs at least one serving per assigned participant",
      );
    const diners = selected.filter((m) => selection.memberIds.includes(m.id));
    const verification = verifyRecipe(recipe, diners, request);
    const meta =
      typeof recipe.dietaryMetadata === "object" && recipe.dietaryMetadata !== null
        ? (recipe.dietaryMetadata as Record<string, unknown>)
        : {};
    if (meta.isComplete === false) {
      verification.violations.push({
        memberId: "all",
        memberName: "All Diners",
        ingredientId: "recipe-completeness",
        rule: "INCOMPLETE_DATASET_RECIPE",
        message: "This recipe is from an incomplete dataset record and is not verified for cookability.",
      });
      verification.status = "REJECTED";
    }
    return {
      ...selection,
      recipeName: recipe.name,
      source: recipe.source,
      memberNames: diners.map((m) => m.name),
      verification,
      minutes: recipe.prepMinutes + recipe.cookMinutes,
      requirements: scaleRecipe(recipe, selection.servings),
      recipeSnapshot: {
        name: recipe.name,
        description: recipe.description,
        source: recipe.source,
        defaultServings: recipe.defaultServings,
        prepMinutes: recipe.prepMinutes,
        cookMinutes: recipe.cookMinutes,
        advancePreparation: recipe.advancePreparation,
        ingredients: recipe.ingredients.map((i) => ({
          ingredientId: i.ingredientId,
          name: i.ingredient.name,
          quantity: i.quantity,
          unit: i.unit,
        })),
        instructions: recipe.instructions.map((i) => i.text),
      },
    };
  });
  const minutes = dishes.reduce((sum, d) => sum + d.minutes, 0);
  const violations = dishes.flatMap((d) => d.verification.violations);
  const clarifications = dishes.flatMap((d) => d.verification.clarifications);
  const inventory = compareInventory(
    aggregateRequirements(dishes.flatMap((d) => d.requirements)),
    data.inventory,
    request.date,
  );
  const rejected = violations.length > 0 || minutes > request.maxMinutes;
  const status = rejected
    ? "REJECTED"
    : clarifications.length || inventory.status === "NEEDS_CONFIRMATION"
      ? "NEEDS_CONFIRMATION"
      : inventory.status === "REQUIRES_SHOPPING"
        ? "REQUIRES_SHOPPING"
        : "READY";
  const scoring = scoreMenu(
    dishes.map((d) => ({
      ...d,
      ingredientIds: d.requirements.map((i) => i.ingredientId),
    })),
    selected,
    inventory,
    data.inventory,
    request.date,
    minutes,
    request.maxMinutes,
    data.recentRecipeIds,
  );
  const explanations = [
    ...dishes.map(
      (d) =>
        `${d.recipeName}: ${d.servings} servings for ${d.memberNames.join(", ")}. ${d.verification.explanation}`,
    ),
    `${minutes} minutes estimated sequential preparation and cooking ${minutes <= request.maxMinutes ? "fits" : "exceeds"} the ${request.maxMinutes}-minute limit. Advance soaking/marination must be completed separately.`,
    inventory.status === "READY"
      ? "All required quantities are confirmed in stock for the selected date."
      : `${inventory.groceries.length} ingredient top-up(s); ${inventory.confirmations.length} inventory fact(s) need confirmation.`,
    dishes.length === 1
      ? "One shared dish keeps preparation simple."
      : "Two dishes accommodate different participant restrictions.",
    ...(dishes.some((d) => data.recentRecipeIds.includes(d.recipeId))
      ? ["Includes a dish selected in the previous seven days."]
      : data.recentRecipeIds.length
        ? ["Does not repeat recipes selected in the previous seven days."]
        : ["No prior meal history is available; variety scoring is neutral."]),
  ];
  return {
    id: selections
      .map(
        (d) =>
          `${d.recipeId}:${d.servings}:${[...d.memberIds].sort().join(",")}`,
      )
      .join("|"),
    status,
    dishes,
    servings: request.servings,
    minutes,
    inventory,
    violations,
    clarifications,
    explanations,
    scoring,
    stateVersion: data.stateVersion,
  };
}
export type Menu = ReturnType<typeof evaluateMenu>;
const readiness: Record<string, number> = {
  READY: 0,
  REQUIRES_SHOPPING: 1,
  NEEDS_CONFIRMATION: 2,
  REJECTED: 3,
};
export function rankMenus(menus: Menu[]) {
  return menus.sort(
    (a, b) =>
      readiness[a.status] - readiness[b.status] ||
      a.dishes.length - b.dishes.length ||
      b.scoring.score - a.scoring.score ||
      a.id.localeCompare(b.id),
  );
}
function fitsCategory(recipe: ResolvedRecipe, type: string) {
  const category = recipe.mealCategory.toLowerCase();
  return (
    category.includes(type) ||
    (category === "breads" && ["lunch", "dinner"].includes(type)) ||
    (type === "snack" && category.includes("breakfast"))
  );
}
export function recommendMenus(request: PlanningRequest, data: PlanningData) {
  const selected = data.members
    .filter((m) => request.memberIds.includes(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (
    selected.length !== request.memberIds.length ||
    selected.some((m) => !m.active)
  )
    throw new Error("Select active members belonging to this household");
  const requested = request.requestedDish
    ? resolveFromRecipes(request.requestedDish, data.recipes)
    : null;
  if (request.requestedDish && !requested)
    return {
      menus: [] as Menu[],
      excluded: [] as { recipeId: string; name: string; reasons: string[] }[],
      unknownDish: request.requestedDish,
      stateVersion: data.stateVersion,
      message:
        "Requested dish is not in the library. Generate a draft explicitly, or clear the dish to browse local options.",
    };
  const candidates = preferredRecipes(data.recipes).filter((r) => {
    const meta =
      typeof r.dietaryMetadata === "object" && r.dietaryMetadata !== null
        ? (r.dietaryMetadata as Record<string, unknown>)
        : {};
    if (meta.isComplete === false) return false;
    return fitsCategory(r, request.mealType) || r.id === requested?.id;
  });
  const excluded: { recipeId: string; name: string; reasons: string[] }[] = [];
  const menus: Menu[] = [];
  for (const recipe of candidates) {
    if (requested && recipe.id !== requested.id) continue;
    const menu = evaluateMenu(
      request,
      [
        {
          recipeId: recipe.id,
          servings: request.servings,
          memberIds: request.memberIds,
        },
      ],
      data,
    );
    if (menu.status !== "REJECTED") menus.push(menu);
    else
      excluded.push({
        recipeId: recipe.id,
        name: recipe.name,
        reasons: [
          ...menu.violations.map((v) => v.message),
          ...(menu.minutes > request.maxMinutes
            ? ["Exceeds the configured time limit."]
            : []),
        ],
      });
  }
  if (!menus.some((m) => m.status === "READY")) {
    const individual = new Map(
      candidates.map((r) => [
        r.id,
        new Map(
          selected.map((m) => [m.id, verifyRecipe(r, [m], request).status]),
        ),
      ]),
    );
    for (let i = 0; i < candidates.length; i++)
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i],
          b = candidates[j];
        if (requested && a.id !== requested.id && b.id !== requested.id)
          continue;
        if (
          a.prepMinutes + a.cookMinutes + b.prepMinutes + b.cookMinutes >
          request.maxMinutes
        )
          continue;
        const groupA: string[] = [],
          groupB: string[] = [];
        let impossible = false;
        for (const m of selected) {
          const sa = individual.get(a.id)!.get(m.id)!,
            sb = individual.get(b.id)!.get(m.id)!;
          if (sa === "REJECTED" && sb === "REJECTED") {
            impossible = true;
            break;
          }
          if (sb === "REJECTED" || (sa === "VERIFIED" && sb !== "VERIFIED"))
            groupA.push(m.id);
          else if (
            sa === "REJECTED" ||
            (sb === "VERIFIED" && sa !== "VERIFIED")
          )
            groupB.push(m.id);
          else (groupA.length <= groupB.length ? groupA : groupB).push(m.id);
        }
        if (impossible || !groupA.length || !groupB.length) continue;
        const extra = request.servings - selected.length;
        const servingsA =
          groupA.length + Math.floor((extra * groupA.length) / selected.length);
        const menu = evaluateMenu(
          request,
          [
            { recipeId: a.id, servings: servingsA, memberIds: groupA },
            {
              recipeId: b.id,
              servings: request.servings - servingsA,
              memberIds: groupB,
            },
          ],
          data,
        );
        if (menu.status !== "REJECTED") menus.push(menu);
      }
  }
  return {
    menus: rankMenus(menus).slice(0, 8),
    excluded,
    unknownDish: null,
    stateVersion: data.stateVersion,
    message: menus.length
      ? "Hard constraints are checked before ranking. Shopping and confirmation needs remain explicit."
      : "No eligible menu covers all selected participants within the time limit. Review exclusions, change participants or increase the time limit.",
  };
}
