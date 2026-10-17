import { z } from "zod";
import { dateOnly, mealTypes } from "./planning";
export const diets = [
  "Vegetarian",
  "Non-vegetarian",
  "Jain",
  "Vegan",
  "Eggetarian",
  "No onion/no garlic",
  "Satvik",
  "Custom",
] as const;
export const units = [
  "g",
  "kg",
  "ml",
  "L",
  "pieces",
  "tbsp",
  "tsp",
  "cups",
] as const;
export const statuses = ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"] as const;
const text = z.string().trim().min(1).max(120);
const list = z.array(text).max(100);
export const fastingSchema = z
  .object({
    permittedIngredients: list,
    prohibitedIngredients: list,
    permittedCategories: list,
    prohibitedCategories: list,
    notes: z.string().max(2000),
    startsOn: dateOnly.nullable().optional(),
    endsOn: dateOnly.nullable().optional(),
    mealType: z.enum(mealTypes).nullable().optional(),
  })
  .strict();
export const memberSchema = z
  .object({
    name: text,
    relationship: z.string().trim().max(80).nullable().optional(),
    dietaryPreference: z.enum(diets),
    allergies: list,
    dislikes: list,
    preferredLanguage: text,
    active: z.boolean(),
    participating: z.boolean(),
    fasting: z.boolean(),
    allowEggs: z.boolean().optional(),
    excludedIngredients: list,
    excludedCategories: list,
    fastingRule: fastingSchema,
  })
  .strict();
export const memberPatch = memberSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No changes supplied");
export const canonical = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s,
    "Invalid date",
  )
  .nullable();
export const inventorySchema = z
  .object({
    ingredientName: text,
    category: text,
    quantity: z.number().finite().min(0).max(1000000).nullable(),
    unit: z.enum(units),
    availability: z.enum(statuses),
    purchaseDate: date.optional(),
    expiryDate: date.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();
export const inventoryPatch = inventorySchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "No changes supplied");
export const recipeSchema = z
  .object({
    originalRecipeId: text.optional(),
    name: text,
    description: z.string().trim().min(1).max(2000),
    defaultServings: z.number().int().min(1).max(100),
    ingredients: z
      .array(
        z
          .object({
            ingredientId: text,
            quantity: z.number().positive().max(100000),
            unit: z.enum(units),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    instructions: z.array(z.string().trim().min(1).max(2000)).min(1).max(50),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.ingredients.map((i) => i.ingredientId)).size ===
      v.ingredients.length,
    "Duplicate ingredients",
  );
export type MemberInput = z.infer<typeof memberSchema>;
