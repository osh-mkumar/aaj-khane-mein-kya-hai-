import Decimal from "decimal.js";
import { convertQuantity } from "./units";
import { normalizeIngredient } from "../recipes/aliases";
import type { Requirement } from "../recipes/scaler";
export type Stock = {
  ingredientId: string;
  quantity: number | null;
  unit: string;
  availability: string;
  expiryDate: Date | string | null;
};
export type IngredientCheck = Requirement & {
  available: number | null;
  missing: number | null;
  status: "CONFIRMED_AVAILABLE" | "CONFIRMED_UNAVAILABLE" | "UNKNOWN";
  topUp: boolean;
  warnings: string[];
};
export type InventoryCheck = {
  status: "READY" | "REQUIRES_SHOPPING" | "NEEDS_CONFIRMATION";
  ingredients: IngredientCheck[];
  groceries: IngredientCheck[];
  confirmations: IngredientCheck[];
};
export function compareInventory(
  requirements: Requirement[],
  stock: Stock[],
  date: string,
): InventoryCheck {
  const ingredients = requirements.map((requirement): IngredientCheck => {
    const items = stock.filter(
      (i) => normalizeIngredient(i.ingredientId) === requirement.ingredientId,
    );
    const warnings = [...requirement.warnings];
    let available: number | null = 0;
    let status: IngredientCheck["status"] = "CONFIRMED_AVAILABLE";
    // A missing record is an unknown fact, not evidence of zero stock.
    if (!items.length) {
      available = null;
      status = "UNKNOWN";
      warnings.push("Not recorded in inventory; confirm stock.");
    }
    for (const item of items) {
      if (item.availability === "UNAVAILABLE") {
        if (items.length === 1) status = "CONFIRMED_UNAVAILABLE";
        continue;
      }
      if (item.availability !== "AVAILABLE" || item.quantity === null) {
        available = null;
        status = "UNKNOWN";
        warnings.push("Availability or quantity is unknown.");
        continue;
      }
      if (
        item.expiryDate &&
        new Date(item.expiryDate).toISOString().slice(0, 10) < date
      ) {
        available = null;
        status = "UNKNOWN";
        warnings.push("Use-by date precedes the meal date; review or replace.");
        continue;
      }
      try {
        const converted = convertQuantity(
          item.quantity,
          item.unit,
          requirement.unit,
        );
        if (available !== null)
          available = new Decimal(available).plus(converted ?? 0).toNumber();
      } catch {
        available = null;
        status = "UNKNOWN";
        warnings.push(
          "Inventory unit cannot be safely converted to the required unit.",
        );
      }
    }
    if (requirement.quantity === null || requirement.warnings.length) {
      status = "UNKNOWN";
    }
    const missing =
      available === null || requirement.quantity === null
        ? null
        : Decimal.max(
            0,
            new Decimal(requirement.quantity).minus(available),
          ).toNumber();
    return {
      ...requirement,
      available,
      missing,
      status,
      topUp: missing !== null && missing > 0,
      warnings: [...new Set(warnings)],
    };
  });
  const confirmations = ingredients.filter((i) => i.status === "UNKNOWN"),
    groceries = ingredients.filter((i) => i.topUp);
  return {
    status: confirmations.length
      ? "NEEDS_CONFIRMATION"
      : groceries.length
        ? "REQUIRES_SHOPPING"
        : "READY",
    ingredients,
    groceries,
    confirmations,
  };
}
