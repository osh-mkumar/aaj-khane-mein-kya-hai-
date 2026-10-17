import { z } from "zod";
import { units } from "./index";

export const actionTypeSchema = z.enum([
  "inventory_unavailable",
  "inventory_set_quantity",
  "inventory_add_quantity",
  "inventory_remove_quantity",
  "fasting_status_update",
  "meal_request",
  "member_preference_update",
  "unknown",
]);

export type ActionType = z.infer<typeof actionTypeSchema>;

export const inventoryUnavailableActionSchema = z
  .object({
    type: z.literal("inventory_unavailable"),
    ingredient: z.string().trim().min(1),
    originalIngredientText: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const inventorySetQuantityActionSchema = z
  .object({
    type: z.literal("inventory_set_quantity"),
    ingredient: z.string().trim().min(1),
    originalIngredientText: z.string().optional(),
    quantity: z.number().positive(),
    unit: z.enum(units),
    notes: z.string().optional(),
  })
  .strict();

export const inventoryAddQuantityActionSchema = z
  .object({
    type: z.literal("inventory_add_quantity"),
    ingredient: z.string().trim().min(1),
    originalIngredientText: z.string().optional(),
    quantity: z.number().positive(),
    unit: z.enum(units),
    notes: z.string().optional(),
  })
  .strict();

export const inventoryRemoveQuantityActionSchema = z
  .object({
    type: z.literal("inventory_remove_quantity"),
    ingredient: z.string().trim().min(1),
    originalIngredientText: z.string().optional(),
    quantity: z.number().positive(),
    unit: z.enum(units),
    notes: z.string().optional(),
  })
  .strict();

export const fastingStatusUpdateActionSchema = z
  .object({
    type: z.literal("fasting_status_update"),
    member: z.string().trim().min(1),
    memberId: z.string().optional(),
    active: z.boolean(),
    notes: z.string().optional(),
  })
  .strict();

export const memberPreferenceUpdateActionSchema = z
  .object({
    type: z.literal("member_preference_update"),
    member: z.string().trim().min(1),
    memberId: z.string().optional(),
    dietaryPreference: z.string().optional(),
    addDislike: z.string().optional(),
    removeDislike: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const mealRequestActionSchema = z
  .object({
    type: z.literal("meal_request"),
    dish: z.string().trim().min(1),
    servings: z.number().int().positive().optional(),
    mealType: z.string().optional(),
    date: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const unknownActionSchema = z
  .object({
    type: z.literal("unknown"),
    rawText: z.string().optional(),
    reason: z.string(),
  })
  .strict();

export const proposedActionSchema = z.discriminatedUnion("type", [
  inventoryUnavailableActionSchema,
  inventorySetQuantityActionSchema,
  inventoryAddQuantityActionSchema,
  inventoryRemoveQuantityActionSchema,
  fastingStatusUpdateActionSchema,
  memberPreferenceUpdateActionSchema,
  mealRequestActionSchema,
  unknownActionSchema,
]);

export type ProposedAction = z.infer<typeof proposedActionSchema>;

export const interpretationResultSchema = z
  .object({
    transcript: z.string(),
    actions: z.array(proposedActionSchema),
    requiresConfirmation: z.literal(true),
    warnings: z.array(z.string()),
  })
  .strict();

export type InterpretationResult = z.infer<typeof interpretationResultSchema>;

export const voiceInterpretRequestSchema = z
  .object({
    transcript: z.string().trim().min(1, "Transcript cannot be empty"),
    householdContext: z
      .object({
        memberNames: z.array(z.string()).optional(),
        inventoryIngredients: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .strict();

export type VoiceInterpretRequest = z.infer<typeof voiceInterpretRequestSchema>;

export const voiceConfirmRequestSchema = z
  .object({
    householdId: z.string().optional(),
    transcript: z.string().optional(),
    idempotencyKey: z.string().trim().min(1, "idempotencyKey is required"),
    expectedStateVersion: z.number().int().nonnegative().optional(),
    actions: z.array(proposedActionSchema).min(1, "At least one action is required"),
  })
  .strict();

export type VoiceConfirmRequest = z.infer<typeof voiceConfirmRequestSchema>;

