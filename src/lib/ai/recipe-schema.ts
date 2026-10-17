import { z } from "zod";
import { units } from "../validation";
export const generatedRecipeSchema = z
  .object({
    name: z.string().min(2).max(120),
    description: z.string().min(1).max(2000),
    defaultServings: z.number().int().min(1).max(100),
    prepMinutes: z.number().int().min(0).max(480),
    cookMinutes: z.number().int().min(0).max(480),
    mealCategory: z.string().min(1).max(80),
    ingredients: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            ingredientId: z
              .string()
              .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
              .max(100),
            quantity: z.number().positive().max(100000).nullable(),
            unit: z.enum(units),
            uncertain: z.boolean(),
            note: z.string().max(500),
          })
          .strict(),
      )
      .min(1)
      .max(60),
    instructions: z.array(z.string().min(1).max(2000)).min(1).max(30),
    advancePreparation: z.string().max(2000),
    substitutions: z.array(z.string().max(500)).max(20),
    dietaryMetadata: z.array(z.string().max(120)).max(20),
    source: z.literal("AI_GENERATED"),
  })
  .strict();
export type GeneratedRecipe = z.infer<typeof generatedRecipeSchema>;
