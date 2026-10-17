import Decimal from "decimal.js";
import { measures } from "../inventory/units";
import { normalizeIngredient } from "./aliases";
import { ingredientKnowledge } from "../dietary/ontology";
export type Requirement = {
  ingredientId: string;
  name: string;
  quantity: number | null;
  unit: string;
  warnings: string[];
};
export type ScalableRecipe = {
  defaultServings: number;
  ingredients: {
    ingredientId: string;
    quantity: unknown;
    unit: string;
    ingredient?: { name: string };
  }[];
};
export function scaleRecipe(
  recipe: ScalableRecipe,
  servings: number,
): Requirement[] {
  if (
    !Number.isFinite(servings) ||
    servings <= 0 ||
    !Number.isFinite(recipe.defaultServings) ||
    recipe.defaultServings <= 0
  )
    throw new Error("Servings must be positive");
  return recipe.ingredients.map((i) => {
    const ingredientId = normalizeIngredient(i.ingredientId);
    const valid =
      typeof i.quantity === "number" &&
      Number.isFinite(i.quantity) &&
      i.quantity > 0;
    const validUnit = Boolean(measures[i.unit]);
    return {
      ingredientId,
      name:
        ingredientKnowledge(ingredientId)?.name ??
        i.ingredient?.name ??
        ingredientId,
      quantity:
        valid && validUnit
          ? new Decimal(i.quantity as number)
              .mul(servings)
              .div(recipe.defaultServings)
              .toNumber()
          : null,
      unit: i.unit,
      warnings: [
        ...(!valid ? ["Quantity requires confirmation."] : []),
        ...(!validUnit ? ["Unsupported unit."] : []),
      ],
    };
  });
}
