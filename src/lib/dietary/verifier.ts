import { normalizeIngredient } from "../recipes/aliases";
import {
  ingredientKnowledge,
  normalizeCategory,
  normalizeAllergy,
  understoodAllergies,
  knownCategories,
} from "./ontology";
export type VerificationStatus = "VERIFIED" | "REJECTED" | "NEEDS_CONFIRMATION";
export type DietaryMember = {
  id: string;
  name: string;
  dietaryPreference: string;
  allowEggs?: boolean;
  allergies: unknown;
  dislikes: unknown;
  fasting: boolean;
  dietaryRules: { target: string; value: string; action: string }[];
  fastingRule: {
    permittedIngredients: unknown;
    prohibitedIngredients: unknown;
    permittedCategories: unknown;
    prohibitedCategories: unknown;
    notes: string;
    startsOn?: string | null;
    endsOn?: string | null;
    mealType?: string | null;
  } | null;
};
export type VerifiableRecipe = {
  name: string;
  ingredients: { ingredientId: string; quantity: unknown; unit: string }[];
};
export type Violation = {
  memberId: string;
  memberName: string;
  ingredientId: string;
  rule: string;
  message: string;
};
export type MemberVerification = {
  memberId: string;
  memberName: string;
  status: VerificationStatus;
  violations: Violation[];
  clarifications: string[];
};
export type Verification = {
  status: VerificationStatus;
  compatibleMembers: string[];
  incompatibleMembers: string[];
  members: MemberVerification[];
  violations: Violation[];
  clarifications: string[];
  explanation: string;
  notice: string;
};
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
export function verifyRecipe(
  recipe: VerifiableRecipe,
  members: DietaryMember[],
  context: { date: string; mealType: string },
): Verification {
  const results: MemberVerification[] = members.map((member) => {
    const violations: Violation[] = [];
    const clarifications: string[] = [];
    const rule = member.fastingRule;
    const fasting =
      member.fasting &&
      (!rule?.startsOn || context.date >= rule.startsOn) &&
      (!rule?.endsOn || context.date <= rule.endsOn) &&
      (!rule?.mealType || context.mealType === rule.mealType);
    const allowedIngredients = strings(rule?.permittedIngredients).map(
        normalizeIngredient,
      ),
      allowedCategories = strings(rule?.permittedCategories).map(
        normalizeCategory,
      ),
      blockedIngredients = strings(rule?.prohibitedIngredients).map(
        normalizeIngredient,
      ),
      blockedCategories = strings(rule?.prohibitedCategories).map(
        normalizeCategory,
      );
    const allergies = strings(member.allergies).map(normalizeAllergy);
    for (const r of member.dietaryRules) {
      if (
        r.action === "EXCLUDE" &&
        ((r.target === "CATEGORY" &&
          !knownCategories.has(normalizeCategory(r.value))) ||
          (r.target === "INGREDIENT" && !ingredientKnowledge(r.value)))
      )
        clarifications.push(
          `${member.name}: exclusion “${r.value}” is not in the verified ingredient taxonomy; clarify the rule.`,
        );
    }
    if (fasting) {
      for (const category of [...allowedCategories, ...blockedCategories])
        if (!knownCategories.has(category))
          clarifications.push(
            `${member.name}: fasting category “${category}” needs clarification.`,
          );
      for (const id of [...allowedIngredients, ...blockedIngredients])
        if (!ingredientKnowledge(id))
          clarifications.push(
            `${member.name}: fasting ingredient “${id}” needs clarification.`,
          );
    }
    for (const allergy of allergies)
      if (!understoodAllergies.has(allergy))
        clarifications.push(
          `${member.name}: clarify allergy “${allergy}”; no safe match is defined.`,
        );
    if (
      fasting &&
      !allowedIngredients.length &&
      !allowedCategories.length &&
      !blockedIngredients.length &&
      !blockedCategories.length
    )
      clarifications.push(
        `${member.name}: active fast has no configured ingredient rules.`,
      );
    for (const ingredient of recipe.ingredients) {
      const id = normalizeIngredient(ingredient.ingredientId),
        knowledge = ingredientKnowledge(id),
        cats = knowledge?.categories ?? [];
      const fail = (key: string, reason: string) =>
        violations.push({
          memberId: member.id,
          memberName: member.name,
          ingredientId: id,
          rule: key,
          message: `${member.name}: ${knowledge?.name ?? id} ${reason}`,
        });
      if (!knowledge || knowledge.uncertain)
        clarifications.push(
          `${member.name}: ${id} has unverified composition; review the product and ingredients.`,
        );
      if (id === "oil" && allergies.length)
        clarifications.push(
          `${member.name}: confirm the source of oil against recorded allergies.`,
        );
      if (
        typeof ingredient.quantity !== "number" ||
        !Number.isFinite(ingredient.quantity) ||
        ingredient.quantity <= 0
      )
        clarifications.push(`${member.name}: ${id} needs a valid quantity.`);
      const profile = member.dietaryPreference;
      const vegetarian = [
        "Vegetarian",
        "Jain",
        "Satvik",
        "Eggetarian",
      ].includes(profile);
      if (
        (vegetarian || profile === "Vegan") &&
        (cats.some((c) => ["meat", "fish", "seafood"].includes(c)) ||
          id === "gelatin")
      )
        fail("PROFILE", `is excluded by the ${profile} profile.`);
      if (
        cats.includes("eggs") &&
        ((vegetarian &&
          profile !== "Eggetarian" &&
          !(profile === "Vegetarian" && member.allowEggs)) ||
          profile === "Vegan")
      )
        fail("PROFILE", "contains eggs, which this profile excludes.");
      if (
        profile === "Vegan" &&
        (cats.includes("dairy") ||
          id === "honey" ||
          cats.includes("animal-derived"))
      )
        fail("PROFILE", "is animal-derived and excluded by the vegan profile.");
      if (
        ["No onion/no garlic", "Satvik"].includes(profile) &&
        ["onion", "garlic"].includes(id)
      )
        fail("PROFILE", `is excluded by the ${profile} profile.`);
      for (const allergy of allergies) {
        if (
          allergy === id ||
          knowledge?.allergens.includes(allergy) ||
          (allergy === "nuts" &&
            (cats.includes("nuts") ||
              knowledge?.allergens.includes("peanuts"))) ||
          (allergy === "tree-nuts" &&
            knowledge?.allergens.includes("tree-nuts"))
        )
          fail("ALLERGY", `conflicts with the recorded ${allergy} allergy.`);
      }
      for (const r of member.dietaryRules)
        if (
          r.action === "EXCLUDE" &&
          ((r.target === "INGREDIENT" && normalizeIngredient(r.value) === id) ||
            (r.target === "CATEGORY" &&
              cats.includes(normalizeCategory(r.value))))
        )
          fail(
            "EXPLICIT_EXCLUSION",
            `matches the explicit exclusion “${r.value}”.`,
          );
      if (fasting) {
        if (
          blockedIngredients.includes(id) ||
          blockedCategories.some((c) => cats.includes(c))
        )
          fail(
            "FASTING_PROHIBITED",
            "is prohibited during this configured fast.",
          );
        if (
          (allowedIngredients.length || allowedCategories.length) &&
          !allowedIngredients.includes(id) &&
          !allowedCategories.some((c) => cats.includes(c))
        )
          fail(
            "FASTING_ALLOWLIST",
            "is outside this fast’s explicit permitted list.",
          );
      }
    }
    return {
      memberId: member.id,
      memberName: member.name,
      status: violations.length
        ? "REJECTED"
        : clarifications.length
          ? "NEEDS_CONFIRMATION"
          : "VERIFIED",
      violations,
      clarifications: [...new Set(clarifications)],
    };
  });
  const violations = results.flatMap((r) => r.violations),
    clarifications = [...new Set(results.flatMap((r) => r.clarifications))];
  if (!members.length) clarifications.push("Select at least one participant.");
  const status = violations.length
    ? "REJECTED"
    : clarifications.length
      ? "NEEDS_CONFIRMATION"
      : "VERIFIED";
  return {
    status,
    members: results,
    compatibleMembers: results
      .filter((r) => r.status === "VERIFIED")
      .map((r) => r.memberId),
    incompatibleMembers: results
      .filter((r) => r.status === "REJECTED")
      .map((r) => r.memberId),
    violations,
    clarifications,
    explanation:
      status === "VERIFIED"
        ? `Satisfies the configured ingredient-level rules for ${members.map((m) => m.name).join(", ")}.`
        : status === "REJECTED"
          ? "One or more configured hard restrictions are violated."
          : "Ingredient or rule clarification is required before compatibility can be verified.",
    notice:
      "Ingredient-level checks do not guarantee allergen-free food. Confirm product labels and cross-contact risks.",
  };
}
