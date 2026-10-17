import { normalizeIngredient, normalizeDish } from "../recipes/aliases";
import { executeAIWithFallback, AIProviderResult } from "./provider";
import {
  interpretationResultSchema,
  InterpretationResult,
  ProposedAction,
} from "../validation/voice";

export interface InterpretContext {
  members?: Array<{ id: string; name: string; relationship?: string | null }>;
  ingredients?: Array<{ id: string; name: string }>;
}

const INTERPRET_SYSTEM_PROMPT = `
You are the voice & text interpretation engine for RasoiOS, a household kitchen management application in India.
Your task is to analyze user transcripts in Hindi, English, Hinglish, or Marathi, and return a JSON object with a list of proposed actions.

The user might state:
1. Inventory availability or shortages (e.g. "Aaj paneer khatam ho gaya", "No tomatoes left") -> type: "inventory_unavailable"
2. Inventory current stock/remaining (e.g. "Palak 500 gram bacha hai", "Rice 2 kg hai") -> type: "inventory_set_quantity"
3. Purchased/added items (e.g. "Add 2 kg rice", "Bought 1 liter milk") -> type: "inventory_add_quantity"
4. Used/consumed items (e.g. "We used 200 grams of tomatoes", "1 kg aaloo use ho gaya") -> type: "inventory_remove_quantity"
5. Fasting status (e.g. "Aaj dadi ka vrat hai", "Mummy is fasting today", "Dad is not fasting") -> type: "fasting_status_update"
6. Meal requests / cooking requests (e.g. "Kal lunch mein 4 logon ke liye chole bhature banana hai", "Make rajma chawal tonight") -> type: "meal_request"
7. Requests for shopping, need, recipe requirement, or unclear statements:
   - CRITICAL RULE: "Paneer 200 gram chahiye" or "Need 200g tomatoes" means they NEED or WANT it, NOT that it is in stock! Do NOT emit inventory_set_quantity or inventory_add_quantity! If it is purely a requirement or unclear, emit type: "unknown" with reason: "Statement indicates a requirement or wish, not current stock or usage."
   - For chit-chat or unrelated topics, emit type: "unknown" with reason explaining the ambiguity.

ALLOWED ACTION SCHEMAS:
- inventory_unavailable: { "type": "inventory_unavailable", "ingredient": string, "notes"?: string }
- inventory_set_quantity: { "type": "inventory_set_quantity", "ingredient": string, "quantity": number, "unit": "g"|"kg"|"ml"|"L"|"pieces"|"tbsp"|"tsp"|"cups", "notes"?: string }
- inventory_add_quantity: { "type": "inventory_add_quantity", "ingredient": string, "quantity": number, "unit": "g"|"kg"|"ml"|"L"|"pieces"|"tbsp"|"tsp"|"cups", "notes"?: string }
- inventory_remove_quantity: { "type": "inventory_remove_quantity", "ingredient": string, "quantity": number, "unit": "g"|"kg"|"ml"|"L"|"pieces"|"tbsp"|"tsp"|"cups", "notes"?: string }
- fasting_status_update: { "type": "fasting_status_update", "member": string, "active": boolean, "notes"?: string }
- meal_request: { "type": "meal_request", "dish": string, "servings"?: number, "mealType"?: string, "date"?: string, "notes"?: string }
- unknown: { "type": "unknown", "reason": string }

RULES:
- Always use canonical or simple English ingredient names where possible (e.g., "spinach", "paneer", "potato", "onion", "tomato", "rice").
- Units MUST strictly be one of: "g", "kg", "ml", "L", "pieces", "tbsp", "tsp", "cups". If "aadha kilo" or "half kg", quantity is 500 and unit is "g", or quantity is 0.5 and unit is "kg" (preferably 500 g). If "250 gram", quantity is 250 and unit is "g".
- For fasting, "member" should match the person referenced (e.g., "Grandmother" or "Dadi", "Mother" or "Mummy").
- NEVER guess or invent missing items or numbers.
- Return ONLY valid JSON in this exact structure without markdown backticks:
{
  "actions": [ ... ],
  "warnings": [ ... ]
}
`;

function resolveMember(
  rawMemberName: string,
  members?: Array<{ id: string; name: string; relationship?: string | null }>
): { name: string; memberId?: string } {
  if (!members || members.length === 0) {
    return { name: rawMemberName };
  }

  const query = rawMemberName.toLowerCase().trim();

  // Common Hindi relationship mappings
  const relMap: Record<string, string[]> = {
    grandmother: ["dadi", "daadi", "nani", "naani", "dadi ji", "nani ji", "grandmother"],
    mother: ["mummy", "maa", "mom", "mataji", "mother", "aai"],
    father: ["papa", "pitaji", "dad", "father", "baba"],
    grandfather: ["dada", "daada", "nana", "naana", "grandfather"],
    daughter: ["beti", "daughter", "ananya"],
    son: ["beta", "son"],
  };

  for (const m of members) {
    const mName = m.name.toLowerCase();
    const mRel = (m.relationship || "").toLowerCase();

    if (mName === query || query.includes(mName)) {
      return { name: m.name, memberId: m.id };
    }

    if (mRel) {
      if (mRel === query || query.includes(mRel)) {
        return { name: m.name, memberId: m.id };
      }
      for (const [key, aliases] of Object.entries(relMap)) {
        if (mRel.includes(key) && aliases.some((a) => query.includes(a))) {
          return { name: m.name, memberId: m.id };
        }
      }
    }
  }

  return { name: rawMemberName };
}

export async function interpretVoiceCommand(
  transcript: string,
  context?: InterpretContext
): Promise<{
  result: InterpretationResult;
  provider: "gemini" | "groq";
  model: string;
  fallbackUsed: boolean;
}> {
  const memberList = context?.members?.map((m) => `${m.name} (${m.relationship || "Member"})`).join(", ");
  const ingredientList = context?.ingredients?.map((i) => i.name).join(", ");

  let userContextPrompt = `TRANSCRIPT: "${transcript}"`;
  if (memberList) {
    userContextPrompt += `\nKNOWN HOUSEHOLD MEMBERS: ${memberList}`;
  }
  if (ingredientList) {
    userContextPrompt += `\nKNOWN KITCHEN INGREDIENTS: ${ingredientList}`;
  }

  const aiResult: AIProviderResult = await executeAIWithFallback({
    systemPrompt: INTERPRET_SYSTEM_PROMPT,
    userPrompt: userContextPrompt,
  });

  // Parse JSON response safely
  let rawJson: { actions?: unknown[]; warnings?: unknown[] };
  try {
    let cleanText = aiResult.text.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.slice(7).trim();
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.slice(3).trim();
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.slice(0, -3).trim();
    }
    rawJson = JSON.parse(cleanText);
  } catch (err) {
    console.error("AI response could not be parsed as JSON:", aiResult.text);
    return {
      result: {
        transcript,
        actions: [
          {
            type: "unknown",
            rawText: transcript,
            reason: "Could not parse AI interpretation into structured actions.",
          },
        ],
        requiresConfirmation: true,
        warnings: ["The AI response format was unexpected."],
      },
      provider: aiResult.provider,
      model: aiResult.model,
      fallbackUsed: aiResult.fallbackUsed,
    };
  }

  const actions: ProposedAction[] = [];
  const warnings: string[] = Array.isArray(rawJson.warnings)
    ? rawJson.warnings.map(String)
    : [];

  const rawActions = Array.isArray(rawJson.actions) ? rawJson.actions : [];

  for (const item of rawActions) {
    if (typeof item !== "object" || item === null) continue;
    const act = item as Record<string, unknown>;

    switch (act.type) {
      case "inventory_unavailable": {
        const rawIng = String(act.ingredient || "").trim();
        const normalized = normalizeIngredient(rawIng);
        actions.push({
          type: "inventory_unavailable",
          ingredient: normalized || rawIng,
          originalIngredientText: rawIng !== normalized ? rawIng : undefined,
          notes: act.notes ? String(act.notes) : undefined,
        });
        break;
      }

      case "inventory_set_quantity":
      case "inventory_add_quantity":
      case "inventory_remove_quantity": {
        const rawIng = String(act.ingredient || "").trim();
        const normalized = normalizeIngredient(rawIng);
        const qty = Number(act.quantity);
        const unit = String(act.unit || "g");

        if (isNaN(qty) || qty <= 0) {
          actions.push({
            type: "unknown",
            rawText: JSON.stringify(act),
            reason: `Invalid or missing quantity for ingredient: ${rawIng}`,
          });
        } else {
          actions.push({
            type: act.type,
            ingredient: normalized || rawIng,
            originalIngredientText: rawIng !== normalized ? rawIng : undefined,
            quantity: qty,
            unit: unit as any,
            notes: act.notes ? String(act.notes) : undefined,
          });
        }
        break;
      }

      case "fasting_status_update": {
        const rawMember = String(act.member || "").trim();
        const resolved = resolveMember(rawMember, context?.members);
        actions.push({
          type: "fasting_status_update",
          member: resolved.name,
          memberId: resolved.memberId,
          active: Boolean(act.active ?? true),
          notes: act.notes ? String(act.notes) : undefined,
        });
        break;
      }

      case "meal_request": {
        const rawDish = String(act.dish || "").trim();
        const normalized = normalizeDish(rawDish);
        actions.push({
          type: "meal_request",
          dish: normalized || rawDish,
          servings: typeof act.servings === "number" ? act.servings : undefined,
          mealType: act.mealType ? String(act.mealType) : undefined,
          date: act.date ? String(act.date) : undefined,
          notes: act.notes ? String(act.notes) : undefined,
        });
        break;
      }

      case "member_preference_update": {
        const rawMember = String(act.member || "").trim();
        const resolved = resolveMember(rawMember, context?.members);
        actions.push({
          type: "member_preference_update",
          member: resolved.name,
          memberId: resolved.memberId,
          dietaryPreference: act.dietaryPreference ? String(act.dietaryPreference) : undefined,
          addDislike: act.addDislike ? String(act.addDislike) : undefined,
          removeDislike: act.removeDislike ? String(act.removeDislike) : undefined,
          notes: act.notes ? String(act.notes) : undefined,
        });
        break;
      }

      case "unknown":
      default: {
        actions.push({
          type: "unknown",
          rawText: act.rawText ? String(act.rawText) : undefined,
          reason: String(act.reason || "Unrecognized action or ambiguous statement"),
        });
        break;
      }
    }
  }

  if (actions.length === 0) {
    actions.push({
      type: "unknown",
      rawText: transcript,
      reason: "No actionable kitchen changes were identified in the statement.",
    });
  }

  const validatedResult = interpretationResultSchema.parse({
    transcript,
    actions,
    requiresConfirmation: true,
    warnings,
  });

  return {
    result: validatedResult,
    provider: aiResult.provider,
    model: aiResult.model,
    fallbackUsed: aiResult.fallbackUsed,
  };
}
