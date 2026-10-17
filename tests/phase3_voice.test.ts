import { describe, it, expect } from "vitest";
import {
  interpretationResultSchema,
  proposedActionSchema,
  voiceInterpretRequestSchema,
} from "../src/lib/validation/voice";

describe("Phase 3.1 Voice & Action Validation", () => {
  it("validates inventory_unavailable action schema", () => {
    const action = {
      type: "inventory_unavailable",
      ingredient: "paneer",
    };
    const parsed = proposedActionSchema.safeParse(action);
    expect(parsed.success).toBe(true);
  });

  it("validates inventory_set_quantity action with valid units", () => {
    const action = {
      type: "inventory_set_quantity",
      ingredient: "spinach",
      quantity: 500,
      unit: "g",
    };
    const parsed = proposedActionSchema.safeParse(action);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid units in inventory_set_quantity", () => {
    const action = {
      type: "inventory_set_quantity",
      ingredient: "spinach",
      quantity: 500,
      unit: "gallons", // not in allowed units list
    };
    const parsed = proposedActionSchema.safeParse(action);
    expect(parsed.success).toBe(false);
  });

  it("validates fasting_status_update with member name", () => {
    const action = {
      type: "fasting_status_update",
      member: "Sushila",
      memberId: "demo-member-id",
      active: true,
    };
    const parsed = proposedActionSchema.safeParse(action);
    expect(parsed.success).toBe(true);
  });

  it("validates meal_request action", () => {
    const action = {
      type: "meal_request",
      dish: "chole-bhature",
      servings: 4,
      mealType: "lunch",
      date: "tomorrow",
    };
    const parsed = proposedActionSchema.safeParse(action);
    expect(parsed.success).toBe(true);
  });

  it("validates unknown action with reason", () => {
    const action = {
      type: "unknown",
      rawText: "Paneer 200 gram chahiye",
      reason: "Statement indicates a requirement or wish, not current stock or usage.",
    };
    const parsed = proposedActionSchema.safeParse(action);
    expect(parsed.success).toBe(true);
  });

  it("validates complete interpretation result contract", () => {
    const result = {
      transcript: "Palak 500 gram bacha hai.",
      actions: [
        {
          type: "inventory_set_quantity",
          ingredient: "spinach",
          quantity: 500,
          unit: "g",
        },
      ],
      requiresConfirmation: true,
      warnings: [],
    };
    const parsed = interpretationResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("enforces requiresConfirmation to be strictly true", () => {
    const result = {
      transcript: "Palak 500 gram bacha hai.",
      actions: [],
      requiresConfirmation: false,
      warnings: [],
    };
    const parsed = interpretationResultSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });

  it("validates incoming voice request payload", () => {
    const valid = voiceInterpretRequestSchema.safeParse({
      transcript: "Paneer khatam ho gaya.",
    });
    expect(valid.success).toBe(true);

    const empty = voiceInterpretRequestSchema.safeParse({
      transcript: "",
    });
    expect(empty.success).toBe(false);
  });
});
