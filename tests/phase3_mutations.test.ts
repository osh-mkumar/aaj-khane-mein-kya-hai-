import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";

const testFile = resolve(`prisma/test-phase3-${process.pid}.db`);
process.env.DATABASE_URL = `file:${testFile.replaceAll("\\", "/")}`;

const { db, HOUSEHOLD_ID } = await import("../src/lib/db");
const { applyConfirmedVoiceActions } = await import("../src/lib/db/voice-mutations");
const mealService = await import("../src/lib/meals/service");

beforeAll(() => {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env: process.env,
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    { env: process.env, stdio: "pipe" },
  );
}, 60000);

afterAll(async () => {
  await db.$disconnect();
  rmSync(testFile, { force: true });
  rmSync(`${testFile}-journal`, { force: true });
});

describe("Phase 3 & 4: Voice Mutations & Self-Correcting Replanning", () => {
  it("applies inventory_set_quantity and updates database correctly", async () => {
    const result = await applyConfirmedVoiceActions(
      [
        {
          type: "inventory_set_quantity",
          ingredient: "spinach",
          quantity: 750,
          unit: "g",
        },
      ],
      { idempotencyKey: "test-idem-key-1" }
    );

    expect(result.success).toBe(true);
    expect(result.appliedActions.length).toBe(1);
    expect(result.appliedActions[0].success).toBe(true);

    // Verify in database: spinach quantity 750 g
    const item = await db.inventoryItem.findFirst({
      where: {
        householdId: HOUSEHOLD_ID,
        ingredientId: "spinach",
      },
    });

    expect(item).toBeDefined();
    expect(item?.quantity).toBe(750);
    expect(item?.unit).toBe("g");
  });

  it("enforces idempotency: repeated request with same key is not applied twice", async () => {
    // First call adds 100g of salt
    const firstCall = await applyConfirmedVoiceActions(
      [
        {
          type: "inventory_add_quantity",
          ingredient: "salt",
          quantity: 100,
          unit: "g",
        },
      ],
      { idempotencyKey: "idempotent-key-repeat-test" }
    );

    expect(firstCall.success).toBe(true);

    const saltAfterFirst = await db.inventoryItem.findFirst({
      where: {
        householdId: HOUSEHOLD_ID,
        ingredient: { name: { contains: "salt" } },
      },
    });

    // Second call with the same idempotency key
    const secondCall = await applyConfirmedVoiceActions(
      [
        {
          type: "inventory_add_quantity",
          ingredient: "salt",
          quantity: 100,
          unit: "g",
        },
      ],
      { idempotencyKey: "idempotent-key-repeat-test" }
    );

    expect(secondCall.success).toBe(true);

    const saltAfterSecond = await db.inventoryItem.findFirst({
      where: {
        householdId: HOUSEHOLD_ID,
        ingredient: { name: { contains: "salt" } },
      },
    });

    // Quantity should NOT have increased again
    expect(saltAfterSecond?.quantity).toBe(saltAfterFirst?.quantity);
  });

  it("updates member fasting status via voice mutation", async () => {
    const grandmother = await db.householdMember.findFirst({
      where: {
        householdId: HOUSEHOLD_ID,
        OR: [
          { name: { contains: "Sushila" } },
          { relationship: { contains: "Grandmother" } },
        ],
      },
    }) || await db.householdMember.findFirstOrThrow();

    const result = await applyConfirmedVoiceActions(
      [
        {
          type: "fasting_status_update",
          member: grandmother.name,
          memberId: grandmother.id,
          active: true,
        },
      ],
      { idempotencyKey: "fasting-key-test-1" }
    );

    expect(result.success).toBe(true);
    expect(result.appliedActions[0].success).toBe(true);

    const updatedMember = await db.householdMember.findUnique({
      where: { id: grandmother.id },
    });
    expect(updatedMember?.fasting).toBe(true);
  });

  it("automatically replans invalid meal plans when key ingredient is unavailable", async () => {
    // 1. Ensure paneer is AVAILABLE in inventory
    const paneerIngredient = await db.ingredient.findFirst({
      where: { name: { contains: "paneer" } },
    });

    if (paneerIngredient) {
      await db.inventoryItem.upsert({
        where: {
          householdId_ingredientId: {
            householdId: HOUSEHOLD_ID,
            ingredientId: paneerIngredient.id,
          },
        },
        update: {
          availability: "AVAILABLE",
          quantity: 500,
          unit: "g",
        },
        create: {
          householdId: HOUSEHOLD_ID,
          ingredientId: paneerIngredient.id,
          availability: "AVAILABLE",
          quantity: 500,
          unit: "g",
        },
      });
    }

    const members = await db.householdMember.findMany({
      where: { householdId: HOUSEHOLD_ID },
    });

    const palakPaneerRecipe = await db.recipe.findFirst({
      where: { name: { contains: "Palak Paneer" } },
    });

    if (palakPaneerRecipe) {
      const today = new Date().toISOString().slice(0, 10);

      // Save an approved meal plan for today lunch with Palak Paneer
      const plan = await db.mealPlan.create({
        data: {
          householdId: HOUSEHOLD_ID,
          scheduledAt: new Date(today),
          mealType: "lunch",
          servings: 4,
          maxMinutes: 60,
          status: "READY",
          stateVersion: 1,
          snapshot: JSON.stringify({
            recipeId: palakPaneerRecipe.id,
            recipeName: palakPaneerRecipe.name,
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
                recipeId: palakPaneerRecipe.id,
                servings: 4,
                memberIds: members.map((m) => m.id),
                recipeSnapshot: palakPaneerRecipe as any,
              },
            ],
          },
        },
      });

      expect(plan.id).toBeDefined();

      // Now voice action: "Paneer khatam ho gaya" -> inventory_unavailable
      const voiceResult = await applyConfirmedVoiceActions(
        [
          {
            type: "inventory_unavailable",
            ingredient: "paneer",
          },
        ],
        { idempotencyKey: `paneer-khatam-${Date.now()}` }
      );

      expect(voiceResult.success).toBe(true);
      // Replan detection should trigger
      expect(voiceResult.replan.needsReplanning).toBe(true);
      expect(voiceResult.replan.explanation).toContain("became invalid");

      // Verify that the meal plan status was marked as REJECTED in the database
      const recheckedPlan = await db.mealPlan.findUnique({
        where: { id: plan.id },
      });
      expect(recheckedPlan?.status).toBe("REJECTED");
    }
  });
});
