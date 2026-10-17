"use client";
import type { InventoryCheck } from "@/lib/inventory/availability";
import { displayQuantity } from "@/lib/inventory/units";
import { Badge } from "../ui/shared";
export function IngredientChecklist({ check }: { check: InventoryCheck }) {
  return (
    <div>
      <div className="section-heading">
        <h3>One checklist for the whole menu</h3>
        <Badge tone={check.status === "READY" ? "green" : "amber"}>
          {check.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Need</th>
              <th>Have</th>
              <th>Buy</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {check.ingredients.map((i) => (
              <tr key={i.ingredientId}>
                <td>
                  <strong>{i.name}</strong>
                  {i.warnings.map((w) => (
                    <small key={w}>{w}</small>
                  ))}
                </td>
                <td>
                  {displayQuantity(i.quantity)} {i.unit}
                </td>
                <td>
                  {displayQuantity(i.available)}{" "}
                  {i.available === null ? "" : i.unit}
                </td>
                <td>
                  {displayQuantity(i.missing)}{" "}
                  {i.missing === null ? "" : i.unit}
                </td>
                <td>
                  <Badge
                    tone={
                      i.status === "UNKNOWN"
                        ? "amber"
                        : i.topUp
                          ? "rose"
                          : "green"
                    }
                  >
                    {i.status === "UNKNOWN"
                      ? "Confirm stock"
                      : i.topUp
                        ? "Top-up needed"
                        : "In stock"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grocery-summary">
        <h3>Consolidated grocery list</h3>
        {check.groceries.length ? (
          <ul>
            {check.groceries.map((i) => (
              <li key={i.ingredientId}>
                {i.name}: {displayQuantity(i.missing)} {i.unit}
              </li>
            ))}
          </ul>
        ) : (
          <p>No confirmed top-ups calculated.</p>
        )}
        {check.confirmations.length > 0 && (
          <p>
            {check.confirmations.map((i) => i.name).join(", ")}: confirm
            quantities or units before shopping. Unknown stock is not assumed
            sufficient.
          </p>
        )}
      </div>
    </div>
  );
}
