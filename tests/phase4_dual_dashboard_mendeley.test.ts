import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";

const testFile = resolve(`prisma/test-dual-dash-${process.pid}.db`);
process.env.DATABASE_URL = `file:${testFile.replaceAll("\\", "/")}`;

const { db, HOUSEHOLD_ID } = await import("../src/lib/db");
const { parseCSV, parseQuantity, standardizeUnit, parseIngredient } = await import(
  "../scripts/import-mendeley"
);
const { evaluateMenu, recommendMenus } = await import("../src/lib/meals/planner");
const { planningData } = await import("../src/lib/meals/service");
const { applyConfirmedVoiceActions } = await import("../src/lib/db/voice-mutations");

beforeAll(() => {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: process.env,
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    { env: { ...process.env, TEST_IMPORT_MENDELEY: "true" }, stdio: "pipe" },
  );
}, 60000);

afterAll(async () => {
  await db.$disconnect();
  rmSync(testFile, { force: true });
  rmSync(`${testFile}-journal`, { force: true });
});

describe("Mendeley Indian Recipe Dataset Integration", () => {
  it("correctly parses complex CSV records with multiline quotes and commas", () => {
    const sampleCsv = `Srno,RecipeName,Ingredients,PrepTimeInMins\n1,"Test Dish, Indian","1 cup rice, 2 tomatoes",15\n2,"Second ""Special"" Dish","2-1/2 cups flour, salt",20`;
    const rows = parseCSV(sampleCsv);
    expect(rows.length).toBe(3);
    expect(rows[0][1]).toBe("RecipeName");
    expect(rows[1][1]).toBe("Test Dish, Indian");
    expect(rows[2][1]).toBe('Second "Special" Dish');
  });

  it("parses fractional and decimal ingredient quantities accurately", () => {
    expect(parseQuantity("2-1/2")).toBe(2.5);
    expect(parseQuantity("2-1 / 2")).toBe(2.5);
    expect(parseQuantity("1/2")).toBe(0.5);
    expect(parseQuantity("3/4")).toBe(0.75);
    expect(parseQuantity("500")).toBe(500);
    expect(parseQuantity("1.5")).toBe(1.5);
    expect(parseQuantity("salt to taste")).toBe(null);
  });

  it("standardizes raw unit strings into allowed RasoiOS unit tokens", () => {
    expect(standardizeUnit("tablespoons")).toBe("tbsp");
    expect(standardizeUnit("teaspoon")).toBe("tsp");
    expect(standardizeUnit("cups")).toBe("cup");
    expect(standardizeUnit("grams")).toBe("g");
    expect(standardizeUnit("kg")).toBe("kg");
    expect(standardizeUnit("cloves")).toBe("clove");
  });

  it("parses individual ingredient strings into canonical representation", () => {
    const parsed = parseIngredient("3 tablespoon Gram flour (besan) - roasted");
    expect(parsed.quantity).toBe(3);
    expect(parsed.unit).toBe("tbsp");
    expect(parsed.hasKnownQty).toBe(true);
    expect(parsed.canonicalId).toBeDefined();
  });

  it("persists imported Mendeley recipes alongside local curated recipes without overwriting", async () => {
    const localRecipes = await db.recipe.findMany({
      where: { source: "LOCAL" },
    });
    expect(localRecipes.length).toBeGreaterThanOrEqual(15);

    const mendeleyRecipes = await db.recipe.findMany({
      where: { source: "MENDELEY" },
    });
    expect(mendeleyRecipes.length).toBeGreaterThan(0);

    // Verify attribution is preserved
    const sampleMendeley = mendeleyRecipes[0];
    const meta = typeof sampleMendeley.dietaryMetadata === "object"
      ? (sampleMendeley.dietaryMetadata as Record<string, unknown>)
      : {};
    expect(meta.attribution).toContain("Mendeley Data");
  });

  it("strictly excludes incomplete dataset recipes from deterministic solver candidates", async () => {
    // Insert a dummy incomplete recipe with isComplete: false
    const incompleteRecipe = await db.recipe.create({
      data: {
        id: `test-incomplete-recipe-${Date.now()}`,
        name: "Incomplete Inspiration Dish",
        description: "Missing cooking steps and quantities",
        mealCategory: "Main Course",
        defaultServings: 4,
        prepMinutes: 10,
        cookMinutes: 20,
        advancePreparation: "None",
        dietaryMetadata: {
          isComplete: false,
          isVerified: false,
          completenessIssues: ["Ingredient quantities unknown"],
        },
        substitutions: [],
        source: "MENDELEY",
        preferredLanguage: "English",
        ingredients: {
          create: [{ ingredientId: "rice", quantity: 1, unit: "cup" }],
        },
        instructions: {
          create: [{ position: 0, text: "Cook as desired." }],
        },
      },
      include: {
        ingredients: { include: { ingredient: true } },
        instructions: true,
      },
    });

    const data = await planningData(db as any, "2026-10-16");
    const activeMembers = data.members.filter((m) => m.active);

    // Incomplete recipe directly evaluated must fail with REJECTED and violation
    const evalResult = evaluateMenu(
      {
        date: "2026-10-16",
        mealType: "lunch",
        servings: 4,
        maxMinutes: 60,
        requestedDish: "",
        memberIds: activeMembers.slice(0, 2).map((m) => m.id),
      },
      [
        {
          recipeId: incompleteRecipe.id,
          servings: 4,
          memberIds: activeMembers.slice(0, 2).map((m) => m.id),
        },
      ],
      data
    );

    expect(evalResult.status).toBe("REJECTED");
    expect(evalResult.violations.some((v) => v.rule === "INCOMPLETE_DATASET_RECIPE")).toBe(true);

    // Recommend menus must never include this incomplete recipe in candidates
    const recommendations = recommendMenus(
      {
        date: "2026-10-16",
        mealType: "lunch",
        servings: 4,
        maxMinutes: 60,
        requestedDish: "",
        memberIds: activeMembers.slice(0, 2).map((m) => m.id),
      },
      data
    );

    const candidateIds = recommendations.menus.flatMap((m) =>
      m.dishes.map((d) => d.recipeId)
    );
    expect(candidateIds).not.toContain(incompleteRecipe.id);
  });
});

describe("Dual Dashboard: Shared State & Cook Replan Workflow", () => {
  it("allows Family to save a plan and Cook to access the exact same plan", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const members = await db.householdMember.findMany({
      where: { householdId: HOUSEHOLD_ID, active: true },
    });
    const dalTadka = await db.recipe.findFirst({
      where: { name: { contains: "Dal Tadka" } },
    });

    expect(dalTadka).toBeDefined();

    // Family schedules dinner with Dal Tadka
    const savedPlan = await db.mealPlan.create({
      data: {
        householdId: HOUSEHOLD_ID,
        scheduledAt: new Date(today),
        mealType: "dinner",
        servings: members.length,
        maxMinutes: 60,
        status: "READY",
        stateVersion: 1,
        snapshot: JSON.stringify({
          recipeId: dalTadka!.id,
          recipeName: dalTadka!.name,
          dishes: [{ recipeId: dalTadka!.id, recipeName: dalTadka!.name, servings: members.length }],
        }),
        participants: {
          create: members.map((m) => ({
            memberId: m.id,
            memberNameSnapshot: m.name,
          })),
        },
        dishes: {
          create: [
            {
              recipeId: dalTadka!.id,
              servings: members.length,
              memberIds: members.map((m) => m.id),
              recipeSnapshot: dalTadka as any,
            },
          ],
        },
      },
      include: { dishes: true, participants: true },
    });

    // Cook queries today's dinner
    const cookVisibleMeals = await db.mealPlan.findMany({
      where: {
        householdId: HOUSEHOLD_ID,
        scheduledAt: new Date(today),
        mealType: "dinner",
      },
      include: { dishes: true },
    });

    expect(cookVisibleMeals.length).toBeGreaterThan(0);
    const cookPlan = cookVisibleMeals[0];
    expect(cookPlan.id).toBe(savedPlan.id);
    expect(cookPlan.dishes[0].recipeId).toBe(dalTadka!.id);
  });

  it("handles Cook reporting unavailable ingredient, updates inventory, and replans for both dashboards", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const members = await db.householdMember.findMany({
      where: { householdId: HOUSEHOLD_ID, active: true },
    });

    // 1. Ensure paneer is in stock
    const paneerIng = await db.ingredient.findFirst({
      where: { name: { contains: "paneer" } },
    });
    if (paneerIng) {
      await db.inventoryItem.upsert({
        where: {
          householdId_ingredientId: {
            householdId: HOUSEHOLD_ID,
            ingredientId: paneerIng.id,
          },
        },
        update: { availability: "AVAILABLE", quantity: 500, unit: "g" },
        create: {
          householdId: HOUSEHOLD_ID,
          ingredientId: paneerIng.id,
          availability: "AVAILABLE",
          quantity: 500,
          unit: "g",
        },
      });
    }

    const palakPaneer = await db.recipe.findFirst({
      where: { name: { contains: "Palak Paneer" } },
    });

    if (palakPaneer) {
      // Family saves Lunch with Palak Paneer
      const lunchPlan = await db.mealPlan.create({
        data: {
          householdId: HOUSEHOLD_ID,
          scheduledAt: new Date(today),
          mealType: "lunch",
          servings: 4,
          maxMinutes: 60,
          status: "READY",
          stateVersion: 1,
          snapshot: JSON.stringify({
            recipeId: palakPaneer.id,
            recipeName: palakPaneer.name,
          }),
          participants: {
            create: members.map((m) => ({
              memberId: m.id,
              memberNameSnapshot: m.name,
            })),
          },
          dishes: {
            create: [
              {
                recipeId: palakPaneer.id,
                servings: 4,
                memberIds: members.map((m) => m.id),
                recipeSnapshot: palakPaneer as any,
              },
            ],
          },
        },
      });

      // 2. Cook on the Cook Dashboard speaks: "Paneer khatam ho gaya"
      const result = await applyConfirmedVoiceActions(
        [
          {
            type: "inventory_unavailable",
            ingredient: "paneer",
          },
        ],
        {
          idempotencyKey: `cook-action-test-${Date.now()}`,
          transcript: "Paneer khatam ho gaya.",
        }
      );

      expect(result.success).toBe(true);
      expect(result.replan.needsReplanning).toBe(true);
      expect(result.replan.invalidatedMealTypes).toContain("lunch");

      // 3. Verify Paneer inventory is UNAVAILABLE in shared database
      const paneerItem = await db.inventoryItem.findFirst({
        where: {
          householdId: HOUSEHOLD_ID,
          ingredientId: "paneer",
        },
      });
      expect(paneerItem?.availability).toBe("UNAVAILABLE");

      // 4. Verify that the previous Palak Paneer meal plan is marked REJECTED
      const updatedPlan = await db.mealPlan.findUnique({
        where: { id: lunchPlan.id },
      });
      expect(updatedPlan?.status).toBe("REJECTED");

      // 5. Shared state: Family Dashboard and Cook Dashboard reading today's lunch see REJECTED/replanned state
      const refreshedPlans = await db.mealPlan.findMany({
        where: {
          householdId: HOUSEHOLD_ID,
          scheduledAt: new Date(today),
          mealType: "lunch",
        },
      });
      expect(refreshedPlans.some((p) => p.status === "REJECTED")).toBe(true);
    }
  });
});
