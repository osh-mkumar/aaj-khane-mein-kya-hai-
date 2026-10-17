import Decimal from "decimal.js";
import { convertQuantity, measures } from "../inventory/units";
import { normalizeIngredient } from "../recipes/aliases";
import type { Requirement } from "../recipes/scaler";
export function aggregateRequirements(
  requirements: Requirement[],
): Requirement[] {
  const grouped = new Map<string, Requirement>();
  for (const item of requirements) {
    const id = normalizeIngredient(item.ingredientId);
    const baseUnit =
      measures[item.unit]?.dimension === "mass"
        ? "g"
        : measures[item.unit]?.dimension === "volume"
          ? "ml"
          : item.unit;
    const quantity = measures[item.unit]
      ? convertQuantity(item.quantity, item.unit, baseUnit)
      : null;
    const previous = grouped.get(id);
    if (!previous) {
      grouped.set(id, {
        ...item,
        ingredientId: id,
        unit: baseUnit,
        quantity,
        warnings: [...item.warnings],
      });
      continue;
    }
    if (previous.unit !== baseUnit) {
      previous.quantity = null;
      previous.warnings.push(
        "The same ingredient uses incompatible units across dishes; confirm amounts.",
      );
    } else
      previous.quantity =
        previous.quantity === null || quantity === null
          ? null
          : new Decimal(previous.quantity).plus(quantity).toNumber();
    previous.warnings.push(...item.warnings);
  }
  return [...grouped.values()]
    .map((i) => ({ ...i, warnings: [...new Set(i.warnings)] }))
    .sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
}
