import { NextResponse } from "next/server";
import { db, HOUSEHOLD_ID } from "@/lib/db";
import { planningData } from "@/lib/meals/service";
import { scaleRecipe } from "@/lib/recipes/scaler";
import { aggregateRequirements } from "@/lib/groceries/aggregator";
import { compareInventory } from "@/lib/inventory/availability";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);

    return await db.$transaction(async (tx) => {
      // Get all active meal plans for today and near future
      const plans = await tx.mealPlan.findMany({
        where: {
          householdId: HOUSEHOLD_ID,
          scheduledAt: { gte: new Date(todayStr) },
          status: { not: "DRAFT" },
        },
        include: { dishes: true },
        take: 10,
      });

      const data = await planningData(tx, todayStr);

      const allRequirements = plans.flatMap((plan) =>
        plan.dishes.flatMap((dish) => {
          const recipe = data.recipes.find((r) => r.id === dish.recipeId);
          if (!recipe) return [];
          const scaled = scaleRecipe(recipe, dish.servings);
          return scaled.map((req) => ({
            ...req,
            recipeName: recipe.name,
            mealPlanId: plan.id,
            mealType: plan.mealType,
          }));
        })
      );

      // Aggregate all needed quantities
      const aggregated = aggregateRequirements(allRequirements);
      const inventoryComparison = compareInventory(aggregated, data.inventory, todayStr);

      // Map grocery gap items with affected recipes
      const groceryGaps = inventoryComparison.groceries.map((item) => {
        const affected = Array.from(
          new Set(
            allRequirements
              .filter((r) => r.ingredientId === item.ingredientId)
              .map((r) => (r as any).recipeName)
          )
        );

        return {
          ingredientId: item.ingredientId,
          name: item.name,
          requiredQuantity: item.quantity,
          availableQuantity: item.available,
          shortfall: item.missing,
          unit: item.unit,
          affectedRecipes: affected,
          status: item.status,
          warnings: item.warnings,
        };
      });

      const confirmationsNeeded = inventoryComparison.confirmations.map((item) => {
        const affected = Array.from(
          new Set(
            allRequirements
              .filter((r) => r.ingredientId === item.ingredientId)
              .map((r) => (r as any).recipeName)
          )
        );
        return {
          ingredientId: item.ingredientId,
          name: item.name,
          requiredQuantity: item.quantity,
          unit: item.unit,
          affectedRecipes: affected,
          warnings: item.warnings,
        };
      });

      return NextResponse.json({
        success: true,
        data: {
          date: todayStr,
          status: inventoryComparison.status,
          groceryGaps,
          confirmationsNeeded,
          plansCount: plans.length,
          stateVersion: data.stateVersion,
        },
      });
    });
  } catch (error) {
    console.error("Grocery gaps calculation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to calculate grocery gaps",
      },
      { status: 500 }
    );
  }
}
