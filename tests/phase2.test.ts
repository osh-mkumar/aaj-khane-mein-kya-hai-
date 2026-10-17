import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
const testFile = resolve(`prisma/test-phase2-${process.pid}.db`);
process.env.DATABASE_URL = `file:${testFile.replaceAll("\\", "/")}`;
const { db } = await import("../src/lib/db");
const s = await import("../src/lib/db/service");
const { scaleRecipe } = await import("../src/lib/recipes/scaler");
const { convertQuantity } = await import("../src/lib/inventory/units");
const { aggregateRequirements } = await import(
  "../src/lib/groceries/aggregator"
);
const { compareInventory } = await import("../src/lib/inventory/availability");
const { verifyRecipe } = await import("../src/lib/dietary/verifier");
const { resolveRecipe, resetRecipe } = await import(
  "../src/lib/recipes/resolver"
);
const { recommendMenus } = await import("../src/lib/meals/planner");
const mealService = await import("../src/lib/meals/service");
const {
  generateRecipe,
  saveGeneratedRecipe,
  validateGeneratedRecipe,
  discardDraft,
} = await import("../src/lib/recipes/generator");
const { POST, GET } = await import("../src/app/api/[...path]/route");
import type { DietaryMember } from "../src/lib/dietary/verifier";
import type { ResolvedRecipe } from "../src/lib/recipes/resolver";
import type { PlanningRequest } from "../src/lib/validation/planning";
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
const date = "2026-10-16";
const context = { date, mealType: "dinner" };
function member(
  overrides: Partial<DietaryMember> = {},
): DietaryMember & { active: boolean } {
  return {
    id: "a",
    name: "Asha",
    dietaryPreference: "Custom",
    allowEggs: false,
    allergies: [],
    dislikes: [],
    fasting: false,
    dietaryRules: [],
    fastingRule: null,
    active: true,
    ...overrides,
  };
}
function simpleRecipe(
  id: string,
  ingredientId: string,
  quantity = 100,
): ResolvedRecipe {
  return {
    id,
    name: id,
    source: "LOCAL",
    defaultServings: 4,
    prepMinutes: 5,
    cookMinutes: 10,
    mealCategory: "Lunch & dinner",
    description: "Test recipe",
    advancePreparation: "",
    dietaryMetadata: [],
    substitutions: [],
    preferredLanguage: "English",
    createdAt: new Date(date),
    updatedAt: new Date(date),
    custom: null,
    generation: null,
    ingredients: [
      {
        id: `${id}-i`,
        recipeId: id,
        ingredientId,
        quantity,
        unit: "g",
        ingredient: { id: ingredientId, name: ingredientId, category: "Other" },
      },
    ],
    instructions: [
      { id: `${id}-s`, recipeId: id, position: 0, text: "Cook until done." },
    ],
  } as ResolvedRecipe;
}
const requirement = (id: string, quantity: number | null, unit = "g") => ({
  ingredientId: id,
  name: id,
  quantity,
  unit,
  warnings: [],
});
describe("Precise ingredient and inventory engines", () => {
  it("scales 250 g for four to 375 g for six and preserves fractional pieces", () => {
    expect(
      scaleRecipe(simpleRecipe("paneer-test", "paneer", 250), 6)[0].quantity,
    ).toBe(375);
    const r = simpleRecipe("egg-test", "egg", 1);
    r.ingredients[0].unit = "pieces";
    expect(scaleRecipe(r, 2)[0].quantity).toBe(0.5);
  });
  it("converts compatible units and rejects incompatible units", () => {
    expect(convertQuantity(1, "kg", "g")).toBe(1000);
    expect(convertQuantity(1, "L", "ml")).toBe(1000);
    expect(convertQuantity(1, "tbsp", "tsp")).toBe(3);
    expect(() => convertQuantity(1, "g", "ml")).toThrow();
    expect(() => convertQuantity(1, "pieces", "g")).toThrow();
  });
  it("flags missing/nonnumeric quantities rather than inventing zero", () => {
    for (const quantity of [null, undefined, "some", -1, NaN])
      expect(
        scaleRecipe(
          {
            defaultServings: 4,
            ingredients: [{ ingredientId: "rice", quantity, unit: "g" }],
          },
          4,
        )[0].quantity,
      ).toBeNull();
  });
  it("aggregates aliases across dishes and flags incompatible requirements", () => {
    expect(
      aggregateRequirements([
        requirement("rice", 0.5, "kg"),
        requirement("chawal", 200),
      ])[0].quantity,
    ).toBe(700);
    const bad = aggregateRequirements([
      requirement("rice", 100),
      requirement("rice", 1, "cups"),
    ])[0];
    expect(bad.quantity).toBeNull();
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
  it("classifies sufficient and insufficient stock with exact shortages", () => {
    const need = [requirement("paneer", 375)];
    const stock = {
      ingredientId: "paneer",
      quantity: 0.2,
      unit: "kg",
      availability: "AVAILABLE",
      expiryDate: null,
    };
    const result = compareInventory(need, [stock], date);
    expect(result.status).toBe("REQUIRES_SHOPPING");
    expect(result.ingredients[0].available).toBe(200);
    expect(result.ingredients[0].missing).toBe(175);
    expect(
      compareInventory(need, [{ ...stock, quantity: 1 }], date).status,
    ).toBe("READY");
  });
  it("does not count unavailable stock and never treats unknown or absent stock as enough", () => {
    const need = [requirement("rice", 100)],
      base = {
        ingredientId: "rice",
        quantity: 999,
        unit: "g",
        availability: "UNAVAILABLE",
        expiryDate: null,
      };
    expect(compareInventory(need, [base], date).ingredients[0].missing).toBe(
      100,
    );
    for (const stock of [
      [],
      [{ ...base, availability: "UNKNOWN" }],
      [{ ...base, availability: "AVAILABLE", quantity: null }],
      [{ ...base, availability: "AVAILABLE", unit: "pieces" }],
      [{ ...base, availability: "AVAILABLE", expiryDate: "2026-10-15" }],
    ])
      expect(compareInventory(need, stock, date).status).toBe(
        "NEEDS_CONFIRMATION",
      );
  });
});
describe("Hard dietary rules per member", () => {
  it("requires clarification for unknown exclusion categories and recognizes derived mustard allergens", () => {
    expect(
      verifyRecipe(
        simpleRecipe("dish", "tomato"),
        [
          member({
            dietaryRules: [
              { target: "CATEGORY", value: "nightshades", action: "EXCLUDE" },
            ],
          }),
        ],
        context,
      ).status,
    ).toBe("NEEDS_CONFIRMATION");
    expect(
      verifyRecipe(
        simpleRecipe("dish", "mustard-oil"),
        [member({ allergies: ["mustard"] })],
        context,
      ).status,
    ).toBe("REJECTED");
  });
  it.each([
    ["No onion/no garlic", "onion"],
    ["Vegan", "paneer"],
    ["Vegan", "honey"],
    ["Vegetarian", "chicken"],
    ["Vegetarian", "egg"],
    ["Eggetarian", "fish"],
  ])("rejects %s / %s", (dietaryPreference, ingredient) => {
    expect(
      verifyRecipe(
        simpleRecipe("dish", ingredient),
        [member({ dietaryPreference })],
        context,
      ).status,
    ).toBe("REJECTED");
  });
  it("allows eggs only with the individual vegetarian option, never over an allergy", () => {
    expect(
      verifyRecipe(
        simpleRecipe("dish", "egg"),
        [member({ dietaryPreference: "Vegetarian", allowEggs: true })],
        context,
      ).status,
    ).toBe("VERIFIED");
    expect(
      verifyRecipe(
        simpleRecipe("dish", "egg"),
        [
          member({
            dietaryPreference: "Vegetarian",
            allowEggs: true,
            allergies: ["eggs"],
          }),
        ],
        context,
      ).status,
    ).toBe("REJECTED");
  });
  it("uses configurable Jain root rules without assuming all Jains exclude roots", () => {
    const recipe = simpleRecipe("dish", "potato");
    expect(
      verifyRecipe(
        recipe,
        [
          member({
            dietaryPreference: "Jain",
            dietaryRules: [
              {
                target: "CATEGORY",
                value: "root vegetables",
                action: "EXCLUDE",
              },
            ],
          }),
        ],
        context,
      ).status,
    ).toBe("REJECTED");
    expect(
      verifyRecipe(recipe, [member({ dietaryPreference: "Jain" })], context)
        .status,
    ).toBe("VERIFIED");
  });
  it("enforces fasting whitelists, prohibition precedence and meal/date windows", () => {
    const fastingRule = {
      permittedIngredients: ["rice"],
      prohibitedIngredients: ["rice"],
      permittedCategories: [],
      prohibitedCategories: [],
      notes: "",
      startsOn: date,
      endsOn: date,
      mealType: "dinner",
    };
    const m = member({ fasting: true, fastingRule });
    expect(
      verifyRecipe(simpleRecipe("dish", "rice"), [m], context).status,
    ).toBe("REJECTED");
    expect(
      verifyRecipe(simpleRecipe("dish", "potato"), [m], context).status,
    ).toBe("REJECTED");
    expect(
      verifyRecipe(simpleRecipe("dish", "rice"), [m], {
        date: "2026-10-17",
        mealType: "dinner",
      }).status,
    ).toBe("VERIFIED");
    expect(
      verifyRecipe(simpleRecipe("dish", "rice"), [m], {
        date,
        mealType: "lunch",
      }).status,
    ).toBe("VERIFIED");
    expect(
      verifyRecipe(
        simpleRecipe("dish", "rice"),
        [member({ fasting: true })],
        context,
      ).status,
    ).toBe("NEEDS_CONFIRMATION");
  });
  it("rejects aliases and derived allergens and flags unknown compounds", () => {
    expect(
      verifyRecipe(
        simpleRecipe("dish", "paneer"),
        [member({ allergies: ["milk"] })],
        context,
      ).status,
    ).toBe("REJECTED");
    expect(
      verifyRecipe(
        simpleRecipe("dish", "peanuts"),
        [member({ allergies: ["groundnuts"] })],
        context,
      ).status,
    ).toBe("REJECTED");
    for (const id of ["mystery-sauce", "garam-masala"])
      expect(
        verifyRecipe(simpleRecipe("dish", id), [member()], context).status,
      ).toBe("NEEDS_CONFIRMATION");
    expect(
      verifyRecipe(
        simpleRecipe("dish", "rice"),
        [member({ allergies: ["unknown allergen"] })],
        context,
      ).status,
    ).toBe("NEEDS_CONFIRMATION");
  });
  it("checks every selected participant and ignores dietary tags", () => {
    const r = simpleRecipe("dish", "chicken");
    r.dietaryMetadata = ["Vegan", "Jain-safe"];
    const result = verifyRecipe(
      r,
      [
        member({ id: "a", dietaryPreference: "Non-vegetarian" }),
        member({ id: "b", dietaryPreference: "Vegetarian" }),
      ],
      context,
    );
    expect(result.compatibleMembers).toEqual(["a"]);
    expect(result.incompatibleMembers).toEqual(["b"]);
    expect(result.status).toBe("REJECTED");
  });
});
describe("Deterministic menu planning", () => {
  const request: PlanningRequest = {
    ...context,
    mealType: "dinner",
    memberIds: ["a", "b"],
    servings: 4,
    maxMinutes: 60,
    requestedDish: "",
  };
  const stock = ["rice", "potato", "paneer", "peanuts"].map((ingredientId) => ({
    ingredientId,
    quantity: 10000,
    unit: "g",
    availability: "AVAILABLE",
    expiryDate: null,
  }));
  it("prefers a verified shared meal and returns repeatable rankings", () => {
    const data = {
      recipes: [
        simpleRecipe("rice-dish", "rice"),
        simpleRecipe("potato-dish", "potato"),
      ],
      members: [member(), member({ id: "b" })],
      inventory: stock,
      stateVersion: 1,
      recentRecipeIds: [],
    };
    const first = recommendMenus(request, data);
    expect(first).toEqual(recommendMenus(request, data));
    expect(first.menus[0].dishes).toHaveLength(1);
    expect(first.menus[0].status).toBe("READY");
    expect(first.menus[0].explanations).toContain(
      "All required quantities are confirmed in stock for the selected date.",
    );
  });
  it("supports two dishes for mutually exclusive restrictions with complete assignments", () => {
    const data = {
      recipes: [
        simpleRecipe("rice-dish", "rice"),
        simpleRecipe("potato-dish", "potato"),
      ],
      members: [
        member({
          dietaryRules: [
            { target: "INGREDIENT", value: "potato", action: "EXCLUDE" },
          ],
        }),
        member({
          id: "b",
          dietaryRules: [
            { target: "INGREDIENT", value: "rice", action: "EXCLUDE" },
          ],
        }),
      ],
      inventory: stock,
      stateVersion: 1,
      recentRecipeIds: [],
    };
    const result = recommendMenus(request, data);
    expect(result.menus[0].dishes).toHaveLength(2);
    expect(result.menus[0].dishes.flatMap((d) => d.memberIds).sort()).toEqual([
      "a",
      "b",
    ]);
    expect(result.menus[0].dishes.reduce((sum, d) => sum + d.servings, 0)).toBe(
      4,
    );
    expect(result.menus[0].minutes).toBe(30);
  });
  it("never improves rankings by ignoring allergy, time or uncovered participants", () => {
    const data = {
      recipes: [simpleRecipe("peanut-dish", "peanuts")],
      members: [member({ allergies: ["peanuts"] }), member({ id: "b" })],
      inventory: stock,
      stateVersion: 1,
      recentRecipeIds: [],
    };
    expect(recommendMenus(request, data).menus).toHaveLength(0);
    expect(
      recommendMenus(
        { ...request, maxMinutes: 1 },
        { ...data, recipes: [simpleRecipe("rice-dish", "rice")] },
      ).menus,
    ).toHaveLength(0);
    expect(() =>
      recommendMenus({ ...request, memberIds: ["outsider"] }, data),
    ).toThrow();
  });
  it("reports confirmed missing quantities without saying ready to cook", () => {
    const result = recommendMenus(request, {
      recipes: [simpleRecipe("rice-dish", "rice")],
      members: [member(), member({ id: "b" })],
      inventory: [{ ...stock[0], quantity: 20 }],
      stateVersion: 1,
      recentRecipeIds: [],
    });
    expect(result.menus[0].status).toBe("REQUIRES_SHOPPING");
    expect(result.menus[0].inventory.groceries[0].missing).toBe(80);
  });
});
describe("Persistent resolution and reviewed generation", () => {
  it("prefers household copies, matches aliases and resets without deleting either version", async () => {
    const original = await s.getRecipe("paneer-bhurji");
    const copy = await s.saveRecipe({
      originalRecipeId: original.id,
      name: "Our paneer",
      description: "Family version",
      defaultServings: 4,
      ingredients: original.ingredients
        .filter((i) => i.ingredientId !== "onion")
        .map((i) => ({
          ingredientId: i.ingredientId,
          quantity: i.ingredientId === "paneer" ? 300 : i.quantity,
          unit: i.unit,
        })),
      instructions: ["Cook without onion."],
    });
    expect((await resolveRecipe("Paneer Bhurji")).recipe?.id).toBe(copy.id);
    expect((await resolveRecipe("Tadka Dal")).recipe?.id).toBe("dal-tadka");
    expect((await resolveRecipe("Aloo ki Sabzi")).recipe?.id).toBe(
      "aloo-sabzi",
    );
    await resetRecipe(copy.id);
    expect((await resolveRecipe("Paneer Bhurji")).recipe?.id).toBe(original.id);
    expect(await s.getRecipe(original.id)).toEqual(original);
    expect((await s.getRecipe(copy.id)).custom?.preferred).toBe(false);
  });
  it("local recipes work without a key and unknown requests return an explicit generation option", async () => {
    const prior = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect((await resolveRecipe("Jeera Rice")).found).toBe(true);
      expect((await resolveRecipe("Unlisted soup")).canGenerate).toBe(true);
      const father = (await s.getMembers()).find(
        (m) => m.relationship === "Father",
      )!;
      await expect(
        generateRecipe({
          dishName: "Unlisted soup",
          memberIds: [father.id],
          date,
          mealType: "dinner",
          servings: 1,
          maxMinutes: 60,
        }),
      ).rejects.toThrow("not configured");
    } finally {
      if (prior) process.env.OPENAI_API_KEY = prior;
    }
  });
  it("validates draft structure and flags ambiguous model ingredients", () => {
    expect(() => validateGeneratedRecipe({ name: "broken" })).toThrow();
    const result = validateGeneratedRecipe({
      ...draftRecipe,
      ingredients: [
        {
          name: "Mystery sauce",
          ingredientId: "rice",
          quantity: null,
          unit: "g",
          uncertain: false,
          note: "",
        },
      ],
    });
    expect(result.recipe.ingredients[0].ingredientId).toBe("mystery-sauce");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("caches unsaved drafts, requires explicit confirmation and records provenance on save", async () => {
    const father = (await s.getMembers()).find(
      (m) => m.relationship === "Father",
    )!;
    const input = {
      dishName: "Simple rice bowl",
      memberIds: [father.id],
      date,
      mealType: "dinner",
      servings: 2,
      maxMinutes: 60,
    };
    const provider = vi.fn(async () => draftRecipe);
    const count = await db.recipe.count();
    const result = await generateRecipe(input, provider);
    expect(result.draft).not.toBeNull();
    expect(await db.recipe.count()).toBe(count);
    await generateRecipe(input, provider);
    expect(provider).toHaveBeenCalledTimes(1);
    await expect(
      saveGeneratedRecipe({ token: result.draft!.token, confirmed: false }),
    ).rejects.toThrow();
    const saved = await saveGeneratedRecipe({
      token: result.draft!.token,
      confirmed: true,
    });
    expect(saved.source).toBe("AI_GENERATED");
    expect(saved.generation?.model).toBeTruthy();
    expect(await db.recipe.count()).toBe(count + 1);
    expect(
      (
        await saveGeneratedRecipe({
          token: result.draft!.token,
          confirmed: true,
        })
      ).id,
    ).toBe(saved.id);
  });
  it("rejects malformed output without persistence and allows discarding drafts", async () => {
    const father = (await s.getMembers()).find(
      (m) => m.relationship === "Father",
    )!;
    const count = await db.recipe.count();
    const input = {
      dishName: "Malformed bowl",
      memberIds: [father.id],
      date,
      mealType: "dinner",
      servings: 2,
      maxMinutes: 60,
    };
    await expect(
      generateRecipe(input, async () => ({ broken: true })),
    ).rejects.toThrow("invalid recipe");
    expect(await db.recipe.count()).toBe(count);
    const draft = (
      await generateRecipe(
        { ...input, dishName: "Discard bowl" },
        async () => ({ ...draftRecipe, name: "Discard bowl" }),
      )
    ).draft!;
    discardDraft({ token: draft.token });
    await expect(
      saveGeneratedRecipe({ token: draft.token, confirmed: true }),
    ).rejects.toThrow("expired or was discarded");
  });
});
const draftRecipe = {
  name: "Simple rice bowl",
  description: "Plain steamed rice.",
  defaultServings: 2,
  prepMinutes: 5,
  cookMinutes: 15,
  mealCategory: "dinner",
  ingredients: [
    {
      name: "Rice",
      ingredientId: "rice",
      quantity: 100,
      unit: "g",
      uncertain: false,
      note: "",
    },
    {
      name: "Water",
      ingredientId: "water",
      quantity: 200,
      unit: "ml",
      uncertain: false,
      note: "",
    },
  ],
  instructions: [
    "Rinse rice.",
    "Cook rice with the measured water until tender.",
  ],
  advancePreparation: "",
  substitutions: [],
  dietaryMetadata: ["Vegan"],
  source: "AI_GENERATED",
};
describe("Official OpenAI SDK boundary", () => {
  it("sends a structured Responses request and parses the schema without network access", async () => {
    const { requestRecipe } = await import("../src/lib/ai/openai-client");
    const key = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    process.env.OPENAI_API_KEY = "test-key-not-a-real-credential";
    process.env.OPENAI_MODEL = "gpt-5-mini";
    const mock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "resp_test",
            status: "completed",
            output: [
              {
                id: "msg_test",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(draftRecipe),
                    annotations: [],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", mock);
    try {
      expect(await requestRecipe('{"dish":"rice bowl"}')).toEqual(draftRecipe);
      expect(mock).toHaveBeenCalledTimes(1);
      const args = mock.mock.calls[0] as unknown as [unknown, RequestInit];
      const payload = JSON.parse(args[1].body as string);
      expect(payload.model).toBe("gpt-5-mini");
      expect(payload.store).toBe(false);
      expect(payload.text.format.type).toBe("json_schema");
      expect(payload.text.format.strict).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      if (key) process.env.OPENAI_API_KEY = key;
      else delete process.env.OPENAI_API_KEY;
      if (model) process.env.OPENAI_MODEL = model;
      else delete process.env.OPENAI_MODEL;
    }
  });
  it("returns a recoverable error for an API refusal", async () => {
    const { requestRecipe } = await import("../src/lib/ai/openai-client");
    const key = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-not-a-real-credential";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: "resp_refused",
              status: "completed",
              output: [
                {
                  type: "message",
                  id: "msg_refused",
                  role: "assistant",
                  status: "completed",
                  content: [
                    { type: "refusal", refusal: "Cannot provide this recipe." },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    try {
      await expect(requestRecipe("recipe")).rejects.toThrow("complete recipe");
    } finally {
      vi.unstubAllGlobals();
      if (key) process.env.OPENAI_API_KEY = key;
      else delete process.env.OPENAI_API_KEY;
    }
  });
  it("does not save an AI draft that violates an allergy even if the model calls it safe", async () => {
    const daughter = (await s.getMembers()).find(
      (m) => m.relationship === "Daughter",
    )!;
    const count = await db.recipe.count();
    const result = await generateRecipe(
      {
        dishName: "Peanut surprise",
        servings: 2,
        date,
        mealType: "dinner",
        memberIds: [daughter.id],
        maxMinutes: 60,
      },
      async () => ({
        ...draftRecipe,
        name: "Peanut surprise",
        dietaryMetadata: ["Allergen-free"],
        ingredients: [
          {
            name: "Peanuts",
            ingredientId: "peanuts",
            quantity: 100,
            unit: "g",
            uncertain: false,
            note: "",
          },
        ],
      }),
    );
    expect(result.draft?.verification.status).toBe("REJECTED");
    await expect(
      saveGeneratedRecipe({ token: result.draft!.token, confirmed: true }),
    ).rejects.toThrow("satisfies");
    expect(await db.recipe.count()).toBe(count);
  });
});
describe("Meal persistence and API scope", () => {
  it("saves/reopens a snapshot without deducting stock, rejects stale and tampered plans", async () => {
    const father = (await s.getMembers()).find(
      (m) => m.relationship === "Father",
    )!;
    const request = {
      date,
      mealType: "dinner",
      memberIds: [father.id],
      servings: 1,
      maxMinutes: 90,
      requestedDish: "Jeera Rice",
    };
    const inventory = await s.getInventory();
    const result = await mealService.recommend(request);
    expect(result.menus.length).toBeGreaterThan(0);
    const chosen = result.menus[0];
    const input = {
      request,
      dishes: chosen.dishes.map((d) => ({
        recipeId: d.recipeId,
        servings: d.servings,
        memberIds: d.memberIds,
      })),
      stateVersion: chosen.stateVersion,
      acknowledgeUncertainty: true,
    };
    const plan = await mealService.saveMeal(input);
    expect((await mealService.getMeal(plan.id)).snapshot).toBeTruthy();
    expect(await s.getInventory()).toEqual(inventory);
    await expect(mealService.saveMeal(input)).rejects.toThrow("changed");
    const fresh = await mealService.recommend(request);
    await expect(
      mealService.saveMeal({
        ...input,
        stateVersion: fresh.stateVersion,
        dishes: [{ ...input.dishes[0], memberIds: ["outsider"] }],
      }),
    ).rejects.toThrow("Every participant");
  });
  it("routes planning APIs and validates arbitrary household IDs and dates", async () => {
    const father = (await s.getMembers()).find(
      (m) => m.relationship === "Father",
    )!;
    const call = (path: string, body: unknown) =>
      POST(
        new Request(`http://localhost/api/${path}`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ path: path.split("/") }) },
      );
    expect(
      (await call("recipes/scale", { recipeId: "paneer-bhurji", servings: 6 }))
        .status,
    ).toBe(200);
    expect(
      (
        await call("recipes/verify", {
          recipeId: "chicken-curry",
          memberIds: [father.id],
          date,
          mealType: "dinner",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("meals/recommend", {
          memberIds: [father.id],
          date,
          mealType: "dinner",
          servings: 1,
          maxMinutes: 60,
          householdId: "other",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("meals/recommend", {
          memberIds: [father.id],
          date: "2026-02-31",
          mealType: "dinner",
          servings: 1,
          maxMinutes: 60,
        })
      ).status,
    ).toBe(422);
    const response = await GET(
      new Request("http://localhost/api/recipes/resolve?name=Tadka%20Dal"),
      { params: Promise.resolve({ path: ["recipes", "resolve"] }) },
    );
    expect((await response.json()).data.recipe.id).toBe("dal-tadka");
  });
});
