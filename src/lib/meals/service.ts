import { Prisma } from "@prisma/client";
import { db, HOUSEHOLD_ID } from "../db";
import { ApiError, log, recipeInclude, recipeScope } from "../db/service";
import {
  recommendSchema,
  saveMealSchema,
  menuSchema,
  verifySchema,
  scaleSchema,
  type PlanningRequest,
} from "../validation/planning";
import { evaluateMenu, recommendMenus, type PlanningData } from "./planner";
import { scaleRecipe } from "../recipes/scaler";
import { aggregateRequirements } from "../groceries/aggregator";
import { compareInventory } from "../inventory/availability";
import { verifyRecipe } from "../dietary/verifier";
export async function planningData(
  tx: Prisma.TransactionClient,
  date: string,
): Promise<PlanningData> {
  const household = await tx.household.findUniqueOrThrow({
    where: { id: HOUSEHOLD_ID },
    include: {
      members: { include: { dietaryRules: true, fastingRule: true } },
      inventory: true,
    },
  });
  const recipes = await tx.recipe.findMany({
    where: recipeScope,
    include: recipeInclude,
    orderBy: { id: "asc" },
  });
  const prior = await tx.mealPlan.findMany({
    where: {
      householdId: HOUSEHOLD_ID,
      scheduledAt: {
        gte: new Date(new Date(date).getTime() - 7 * 86400000),
        lt: new Date(date),
      },
      status: { not: "DRAFT" },
    },
    include: { dishes: true },
  });
  return {
    members: household.members,
    inventory: household.inventory,
    recipes,
    stateVersion: household.version,
    recentRecipeIds: prior.flatMap((p) =>
      p.dishes.map((d) => d.recipeId).filter((v): v is string => !!v),
    ),
  };
}
export async function recommend(input: unknown) {
  const request = recommendSchema.parse(input);
  return db.$transaction(async (tx) => {
    try {
      return recommendMenus(request, await planningData(tx, request.date));
    } catch (e) {
      throw new ApiError(422, (e as Error).message);
    }
  });
}
export async function saveMeal(input: unknown) {
  const v = saveMealSchema.parse(input);
  return db.$transaction(async (tx) => {
    const data = await planningData(tx, v.request.date);
    if (data.stateVersion !== v.stateVersion)
      throw new ApiError(
        409,
        "Household data changed. Find meals again to recalculate this plan.",
      );
    let menu;
    try {
      menu = evaluateMenu(v.request, v.dishes, data);
    } catch (e) {
      throw new ApiError(422, (e as Error).message);
    }
    if (menu.status === "REJECTED")
      throw new ApiError(
        422,
        "Cannot save a plan that violates dietary or time constraints",
      );
    if (menu.status !== "READY" && !v.acknowledgeUncertainty)
      throw new ApiError(
        422,
        "Acknowledge the shopping or confirmation requirements before saving this conditional plan",
      );
    const snapshot = JSON.parse(
      JSON.stringify({
        request: v.request,
        menu,
        memberRules: data.members.filter((m) =>
          v.request.memberIds.includes(m.id),
        ),
      }),
    );
    const plan = await tx.mealPlan.create({
      data: {
        householdId: HOUSEHOLD_ID,
        scheduledAt: new Date(v.request.date),
        mealType: v.request.mealType,
        servings: v.request.servings,
        maxMinutes: v.request.maxMinutes,
        status: menu.status,
        stateVersion: data.stateVersion,
        snapshot,
        participants: {
          create: v.request.memberIds.map((memberId) => ({
            memberId,
            memberNameSnapshot: data.members.find((m) => m.id === memberId)!
              .name,
          })),
        },
        dishes: {
          create: menu.dishes.map((d) => ({
            recipeId: d.recipeId,
            servings: d.servings,
            memberIds: d.memberIds,
            recipeSnapshot: JSON.parse(JSON.stringify(d.recipeSnapshot)),
          })),
        },
      },
      include: { dishes: true, participants: true },
    });
    await log(
      tx,
      "MEAL_PLAN_SAVED",
      plan.id,
      `${v.request.mealType} on ${v.request.date}: ${menu.dishes.map((d) => d.recipeName).join(" + ")} (${menu.status.toLowerCase().replaceAll("_", " ")}). Inventory was not deducted.`,
    );
    return plan;
  });
}
export async function getMeals(date?: string) {
  return db.mealPlan.findMany({
    where: {
      householdId: HOUSEHOLD_ID,
      ...(date ? { scheduledAt: new Date(date) } : {}),
    },
    include: { dishes: true, participants: true },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
}
export async function getMeal(id: string) {
  const meal = await db.mealPlan.findFirst({
    where: { id, householdId: HOUSEHOLD_ID },
    include: { dishes: true, participants: true },
  });
  if (!meal) throw new ApiError(404, "Meal plan not found");
  const h = await db.household.findUniqueOrThrow({
    where: { id: HOUSEHOLD_ID },
  });
  return {
    ...meal,
    currentStateVersion: h.version,
    needsRecheck: h.version > meal.stateVersion + 1,
  };
}
export async function checkIngredients(input: unknown) {
  const v = menuSchema.parse(input);
  return db.$transaction(async (tx) => {
    const data = await planningData(tx, v.date);
    const requirements = v.dishes.flatMap((d) => {
      if (
        d.memberIds.some(
          (id) => !data.members.some((m) => m.id === id && m.active),
        )
      )
        throw new ApiError(422, "Select active household members");
      const r = data.recipes.find((r) => r.id === d.recipeId);
      if (!r) throw new ApiError(404, "Recipe not found");
      return scaleRecipe(r, d.servings);
    });
    return compareInventory(
      aggregateRequirements(requirements),
      data.inventory,
      v.date,
    );
  });
}
export async function scale(input: unknown) {
  const v = scaleSchema.parse(input);
  return db.$transaction(async (tx) => {
    const recipe = await tx.recipe.findFirst({
      where: { id: v.recipeId, ...recipeScope },
      include: recipeInclude,
    });
    if (!recipe) throw new ApiError(404, "Recipe not found");
    return {
      recipeId: recipe.id,
      baseServings: recipe.defaultServings,
      servings: v.servings,
      ingredients: scaleRecipe(recipe, v.servings),
      countPolicy:
        "Fractional pieces are preserved. Round for purchase only after reviewing the ingredient.",
    };
  });
}
export async function verify(input: unknown) {
  const v = verifySchema.parse(input);
  return db.$transaction(async (tx) => {
    const data = await planningData(tx, v.date);
    const recipe = data.recipes.find((r) => r.id === v.recipeId);
    if (!recipe) throw new ApiError(404, "Recipe not found");
    const members = data.members.filter(
      (m) => v.memberIds.includes(m.id) && m.active,
    );
    if (members.length !== v.memberIds.length)
      throw new ApiError(422, "Select active household members");
    return verifyRecipe(recipe, members, v);
  });
}
