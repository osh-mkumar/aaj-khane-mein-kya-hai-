import { z } from "zod";
export const mealTypes = ["breakfast", "lunch", "snack", "dinner"] as const;
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Invalid calendar date",
  );
export const ids = z
  .array(z.string().trim().min(1).max(128))
  .min(1)
  .max(12)
  .refine((v) => new Set(v).size === v.length, "Duplicate participants");
export const contextSchema = z
  .object({ memberIds: ids, date: dateOnly, mealType: z.enum(mealTypes) })
  .strict();
export const recommendSchema = contextSchema
  .extend({
    servings: z.number().int().min(1).max(100),
    maxMinutes: z.number().int().min(1).max(480),
    requestedDish: z.string().trim().max(120).default(""),
  })
  .strict()
  .refine(
    (v) => v.servings >= v.memberIds.length,
    "Provide at least one serving per participant",
  );
export const dishSchema = z
  .object({
    recipeId: z.string().min(1).max(128),
    servings: z.number().int().min(1).max(100),
    memberIds: ids,
  })
  .strict();
export const menuSchema = z
  .object({ dishes: z.array(dishSchema).min(1).max(2), date: dateOnly })
  .strict();
export const saveMealSchema = z
  .object({
    request: recommendSchema,
    dishes: z.array(dishSchema).min(1).max(2),
    stateVersion: z.number().int().min(1),
    acknowledgeUncertainty: z.boolean().default(false),
  })
  .strict();
export const scaleSchema = z
  .object({
    recipeId: z.string().min(1).max(128),
    servings: z.number().int().min(1).max(100),
  })
  .strict();
export const verifySchema = contextSchema
  .extend({ recipeId: z.string().min(1).max(128) })
  .strict();
export const generateSchema = contextSchema
  .extend({
    dishName: z.string().trim().min(2).max(120),
    servings: z.number().int().min(1).max(100),
    cuisine: z.string().trim().max(80).default("Indian"),
    maxMinutes: z.number().int().min(1).max(480),
    preferredLanguage: z.string().trim().min(1).max(50).default("English"),
  })
  .strict();
export type PlanningRequest = z.infer<typeof recommendSchema>;
export type DishSelection = z.infer<typeof dishSchema>;
export type GenerationRequest = z.infer<typeof generateSchema>;
export type MealContext = z.infer<typeof contextSchema>;
