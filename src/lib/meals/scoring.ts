import type { DietaryMember } from "../dietary/verifier";
import type { InventoryCheck, Stock } from "../inventory/availability";
import { normalizeIngredient, normalizeDish } from "../recipes/aliases";
export const SCORE_WEIGHTS = {
  preference: 0.3,
  freshness: 0.25,
  variety: 0.2,
  convenience: 0.15,
  groceryCost: 0.1,
} as const;
export type ScoreComponents = Record<keyof typeof SCORE_WEIGHTS, number>;
export function scoreMenu(
  dishes: {
    recipeId: string;
    recipeName: string;
    memberIds: string[];
    ingredientIds: string[];
  }[],
  members: DietaryMember[],
  inventory: InventoryCheck,
  stock: Stock[],
  date: string,
  minutes: number,
  maxMinutes: number,
  recentRecipeIds: string[],
) {
  let comparisons = 0,
    dislikes = 0;
  for (const dish of dishes)
    for (const member of members.filter((m) => dish.memberIds.includes(m.id))) {
      comparisons++;
      const list = Array.isArray(member.dislikes)
        ? member.dislikes.filter((v): v is string => typeof v === "string")
        : [];
      if (
        list.some(
          (d) =>
            normalizeDish(d) === normalizeDish(dish.recipeName) ||
            dish.ingredientIds.includes(normalizeIngredient(d)),
        )
      )
        dislikes++;
    }
  const fresh = inventory.ingredients.filter((i) =>
    stock.some(
      (s) =>
        normalizeIngredient(s.ingredientId) === i.ingredientId &&
        s.availability === "AVAILABLE" &&
        s.quantity !== null &&
        s.quantity > 0 &&
        s.expiryDate &&
        new Date(s.expiryDate).toISOString().slice(0, 10) >= date &&
        (new Date(new Date(s.expiryDate).toISOString().slice(0, 10)).getTime() -
          new Date(date).getTime()) /
          86400000 <=
          3,
    ),
  ).length;
  const components: ScoreComponents = {
    preference: comparisons ? 0.5 * (1 - dislikes / comparisons) : 0.5,
    freshness: inventory.ingredients.length
      ? fresh / inventory.ingredients.length
      : 0,
    variety: recentRecipeIds.length
      ? 1 -
        dishes.filter((d) => recentRecipeIds.includes(d.recipeId)).length /
          dishes.length
      : 0.5,
    convenience: Math.max(0, 1 - minutes / maxMinutes),
    groceryCost: 0.5,
  };
  // No prices are stored: grocery-cost preference stays neutral, not invented.
  const score = Object.entries(SCORE_WEIGHTS).reduce(
    (sum, [key, weight]) =>
      sum + components[key as keyof ScoreComponents] * weight,
    0,
  );
  return {
    score,
    components,
    weights: SCORE_WEIGHTS,
    notes: [
      "Taste starts neutral (0.5); recorded dislikes reduce it.",
      "Cost stays neutral (0.5): no grocery prices are stored.",
      "Variety uses saved plans in the seven days before this meal, not assumed cooking history.",
    ],
  };
}
