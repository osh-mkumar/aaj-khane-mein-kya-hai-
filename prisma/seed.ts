import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ingredientCatalog, recipes } from "../src/lib/recipes/catalog";
const db = new PrismaClient();
async function main() {
  await db.$transaction(
    async (tx) => {
      if (await tx.household.findUnique({ where: { id: "demo-household" } })) {
        console.log("Demo household already exists; preserving your data.");
        return;
      }
      await tx.household.create({
        data: { id: "demo-household", name: "The Mehta Kitchen" },
      });
      for (const [id, [name, category]] of Object.entries(ingredientCatalog))
        await tx.ingredient.create({ data: { id, name, category } });
      for (const r of recipes) {
        const { ingredients, instructions, ...data } = r;
        await tx.recipe.create({
          data: {
            ...data,
            source: "LOCAL",
            preferredLanguage: "Hindi",
            ingredients: {
              create: ingredients.map(([ingredientId, quantity, unit]) => ({
                ingredientId,
                quantity,
                unit,
              })),
            },
            instructions: {
              create: instructions.map((text, position) => ({
                text,
                position,
              })),
            },
          },
        });
      }
      const profiles = [
        {
          name: "Kavita",
          relationship: "Mother",
          dietaryPreference: "Jain",
          excluded: ["onion", "garlic"],
          categories: ["root-vegetables"],
          fasting: false,
          allergies: [],
          dislikes: [],
        },
        {
          name: "Arun",
          relationship: "Father",
          dietaryPreference: "Non-vegetarian",
          excluded: [],
          categories: [],
          fasting: false,
          allergies: [],
          dislikes: ["bitter-gourd"],
        },
        {
          name: "Ananya",
          relationship: "Daughter",
          dietaryPreference: "Vegetarian",
          excluded: [],
          categories: ["meat", "fish", "eggs"],
          fasting: false,
          allergies: ["peanuts"],
          dislikes: [],
        },
        {
          name: "Sushila",
          relationship: "Grandmother",
          dietaryPreference: "Custom",
          excluded: [],
          categories: [],
          fasting: true,
          allergies: [],
          dislikes: [],
        },
      ];
      for (const p of profiles) {
        const { excluded, categories, ...data } = p;
        await tx.householdMember.create({
          data: {
            ...data,
            householdId: "demo-household",
            preferredLanguage: "Hindi",
            dietaryRules: {
              create: [
                ...excluded.map((value) => ({ target: "INGREDIENT", value })),
                ...categories.map((value) => ({ target: "CATEGORY", value })),
              ],
            },
            fastingRule: {
              create: {
                permittedIngredients: p.fasting
                  ? ["sabudana", "potato", "rock-salt"]
                  : [],
                prohibitedIngredients: p.fasting ? ["onion", "garlic"] : [],
                permittedCategories: [],
                prohibitedCategories: p.fasting
                  ? ["grains", "pulses", "meat", "eggs"]
                  : [],
                notes: p.fasting
                  ? "Family-specific example only. Confirm ingredients before cooking."
                  : "",
              },
            },
          },
        });
      }
      const stock: [string, number | null, string, string, number | null][] = [
        ["rice", 3, "kg", "AVAILABLE", null],
        ["wheat-flour", 2, "kg", "AVAILABLE", null],
        ["toor-dal", 750, "g", "AVAILABLE", null],
        ["paneer", 300, "g", "AVAILABLE", 2],
        ["spinach", 500, "g", "AVAILABLE", 1],
        ["tomato", 800, "g", "AVAILABLE", 3],
        ["potato", 1.5, "kg", "AVAILABLE", 10],
        ["onion", 1, "kg", "AVAILABLE", 10],
        ["oil", 1, "L", "AVAILABLE", null],
        ["cumin", 100, "g", "AVAILABLE", null],
        ["salt", 500, "g", "AVAILABLE", null],
        ["sabudana", null, "g", "UNKNOWN", null],
        ["chicken", 0, "g", "UNAVAILABLE", null],
        ["egg", 6, "pieces", "AVAILABLE", 7],
      ];
      for (const [ingredientId, quantity, unit, availability, days] of stock) {
        const expiryDate =
          days === null ? null : new Date(Date.now() + days * 86400000);
        await tx.inventoryItem.create({
          data: {
            householdId: "demo-household",
            ingredientId,
            quantity,
            unit,
            availability,
            expiryDate,
          },
        });
      }
      await tx.activityLog.create({
        data: {
          householdId: "demo-household",
          type: "HOUSEHOLD_CREATED",
          entityId: "demo-household",
          description:
            "Welcome to the Mehta kitchen. Four fictional profiles and 15 local recipes are ready.",
          stateVersion: 1,
        },
      });
    },
    { timeout: 30000 },
  );
  console.log(
    "Seed complete: fictional household, 15 recipes and kitchen inventory.",
  );

  const shouldImportMendeley =
    process.env.TEST_IMPORT_MENDELEY === "true" ||
    (!process.env.VITEST && !process.env.DATABASE_URL?.includes("test-"));

  if (shouldImportMendeley) {
    try {
      console.log("Importing Mendeley Indian Recipe Dataset into library...");
      const { importMendeleyRecipes } = await import("../scripts/import-mendeley");
      await importMendeleyRecipes({ maxImport: 100 });
    } catch (err) {
      console.warn("Mendeley dataset import notice:", err);
    }
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
