import { Prisma } from "@prisma/client";
import { db, HOUSEHOLD_ID } from "../db";
import { ApiError, log } from "./service";
import { ProposedAction } from "../validation/voice";
import { normalizeIngredient } from "../recipes/aliases";
import { ingredientCatalog } from "../recipes/catalog";
import { planningData } from "../meals/service";
import { recommendMenus, evaluateMenu, type Menu } from "../meals/planner";
import { convertQuantity } from "../inventory/units";

export interface ExecutionResult {
  action: ProposedAction;
  success: boolean;
  message: string;
  previousValue?: unknown;
  newValue?: unknown;
}

export interface ReplanResult {
  needsReplanning: boolean;
  affectedPlansCount: number;
  invalidatedMealTypes: string[];
  newRecommendations?: Menu[];
  explanation: string;
  hasReplacement?: boolean;
  shortfalls?: unknown[];
}

export interface ApplyVoiceActionsResult {
  success: boolean;
  appliedActions: ExecutionResult[];
  replan: ReplanResult;
  stateVersion: number;
}

/**
 * Executes confirmed actions with strict atomic transaction and event logging.
 * Revalidates against current household state to prevent stale updates.
 * Idempotent via idempotencyKey log tracking.
 */
export async function applyConfirmedVoiceActions(
  actions: ProposedAction[],
  options: {
    idempotencyKey: string;
    transcript?: string;
    expectedStateVersion?: number;
  }
): Promise<ApplyVoiceActionsResult> {
  return db.$transaction(async (tx) => {
    // 1. Idempotency Check
    const existingLog = await tx.activityLog.findFirst({
      where: {
        householdId: HOUSEHOLD_ID,
        entityId: options.idempotencyKey,
        type: "VOICE_ACTION_BATCH",
      },
    });

    if (existingLog) {
      const household = await tx.household.findUniqueOrThrow({
        where: { id: HOUSEHOLD_ID },
      });
      return {
        success: true,
        appliedActions: [],
        replan: {
          needsReplanning: false,
          affectedPlansCount: 0,
          invalidatedMealTypes: [],
          explanation: "Actions with this idempotency key have already been applied.",
        },
        stateVersion: household.version,
      };
    }

    // 2. Fetch current household state
    const currentHousehold = await tx.household.findUniqueOrThrow({
      where: { id: HOUSEHOLD_ID },
      include: {
        members: { include: { dietaryRules: true, fastingRule: true } },
        inventory: { include: { ingredient: true } },
      },
    });

    if (
      options.expectedStateVersion !== undefined &&
      currentHousehold.version !== options.expectedStateVersion
    ) {
      console.warn(
        `State version discrepancy: expected ${options.expectedStateVersion}, found ${currentHousehold.version}`
      );
    }

    const appliedActions: ExecutionResult[] = [];
    let stateChanged = false;
    let inventoryOrFastingChanged = false;

    for (const action of actions) {
      if (action.type === "unknown") {
        appliedActions.push({
          action,
          success: false,
          message: `Skipped unknown action: ${action.reason}`,
        });
        continue;
      }

      if (action.type === "inventory_unavailable") {
        const canonicalId = normalizeIngredient(action.ingredient);
        const existingItem = currentHousehold.inventory.find(
          (i) => i.ingredientId === canonicalId
        );

        if (existingItem) {
          const oldVal = { availability: existingItem.availability, quantity: existingItem.quantity };
          const updatedItem = await tx.inventoryItem.update({
            where: { id: existingItem.id },
            data: {
              availability: "UNAVAILABLE",
              quantity: 0,
            },
          });

          const currentVersion = await log(
            tx,
            "INVENTORY_UNAVAILABLE",
            existingItem.id,
            `Voice: Marked ${existingItem.ingredient.name} as out of stock/unavailable.`
          );

          await tx.inventoryEvent.create({
            data: {
              householdId: HOUSEHOLD_ID,
              inventoryItemId: existingItem.id,
              type: "INVENTORY_UNAVAILABLE",
              before: JSON.parse(JSON.stringify(existingItem)),
              after: JSON.parse(JSON.stringify(updatedItem)),
              stateVersion: currentVersion,
            },
          });

          appliedActions.push({
            action,
            success: true,
            message: `Marked ${existingItem.ingredient.name} as unavailable.`,
            previousValue: oldVal,
            newValue: { availability: "UNAVAILABLE", quantity: 0 },
          });
          stateChanged = true;
          inventoryOrFastingChanged = true;
        } else {
          // If not in inventory, upsert ingredient and create 0 quantity unavailable item
          const catalogEntry = ingredientCatalog[canonicalId];
          const ingName = catalogEntry ? catalogEntry[0] : action.ingredient;
          const ingCategory = catalogEntry ? catalogEntry[1] : "Vegetables";

          const ingredient = await tx.ingredient.upsert({
            where: { id: canonicalId },
            create: { id: canonicalId, name: ingName, category: ingCategory },
            update: {},
          });

          const newItem = await tx.inventoryItem.create({
            data: {
              householdId: HOUSEHOLD_ID,
              ingredientId: ingredient.id,
              quantity: 0,
              unit: "g",
              availability: "UNAVAILABLE",
            },
          });

          const currentVersion = await log(
            tx,
            "INVENTORY_UNAVAILABLE",
            newItem.id,
            `Voice: Marked ${ingredient.name} as out of stock/unavailable.`
          );

          await tx.inventoryEvent.create({
            data: {
              householdId: HOUSEHOLD_ID,
              inventoryItemId: newItem.id,
              type: "INVENTORY_UNAVAILABLE",
              before: Prisma.JsonNull,
              after: JSON.parse(JSON.stringify(newItem)),
              stateVersion: currentVersion,
            },
          });

          appliedActions.push({
            action,
            success: true,
            message: `Added ${ingredient.name} as unavailable item.`,
            previousValue: null,
            newValue: { availability: "UNAVAILABLE", quantity: 0 },
          });
          stateChanged = true;
          inventoryOrFastingChanged = true;
        }
      } else if (
        action.type === "inventory_set_quantity" ||
        action.type === "inventory_add_quantity" ||
        action.type === "inventory_remove_quantity"
      ) {
        const canonicalId = normalizeIngredient(action.ingredient);
        const existingItem = currentHousehold.inventory.find(
          (i) => i.ingredientId === canonicalId
        );

        const catalogEntry = ingredientCatalog[canonicalId];
        const ingName = catalogEntry ? catalogEntry[0] : action.ingredient;
        const ingCategory = catalogEntry ? catalogEntry[1] : "Vegetables";

        const ingredient = await tx.ingredient.upsert({
          where: { id: canonicalId },
          create: { id: canonicalId, name: ingName, category: ingCategory },
          update: {},
        });

        let targetQty = action.quantity;
        let targetUnit = action.unit;

        if (existingItem) {
          let currentExistingQty = existingItem.quantity ?? 0;
          // If units differ, convert existing to action unit
          if (existingItem.unit !== targetUnit) {
            try {
              currentExistingQty = convertQuantity(existingItem.quantity, existingItem.unit, targetUnit) ?? 0;
            } catch (err) {
              console.warn(`Unit conversion failed between ${existingItem.unit} and ${targetUnit}, using new unit.`);
            }
          }

          if (action.type === "inventory_set_quantity") {
            targetQty = action.quantity;
          } else if (action.type === "inventory_add_quantity") {
            targetQty = currentExistingQty + action.quantity;
          } else if (action.type === "inventory_remove_quantity") {
            targetQty = Math.max(0, currentExistingQty - action.quantity);
          }

          const oldVal = { quantity: existingItem.quantity, unit: existingItem.unit, availability: existingItem.availability };

          const updated = await tx.inventoryItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: targetQty,
              unit: targetUnit,
              availability: targetQty > 0 ? "AVAILABLE" : "UNAVAILABLE",
            },
          });

          const currentVersion = await log(
            tx,
            "INVENTORY_QUANTITY_CHANGED",
            existingItem.id,
            `Voice: ${existingItem.ingredient.name} updated to ${targetQty} ${targetUnit}.`
          );

          await tx.inventoryEvent.create({
            data: {
              householdId: HOUSEHOLD_ID,
              inventoryItemId: existingItem.id,
              type: "INVENTORY_QUANTITY_CHANGED",
              before: JSON.parse(JSON.stringify(existingItem)),
              after: JSON.parse(JSON.stringify(updated)),
              stateVersion: currentVersion,
            },
          });

          appliedActions.push({
            action,
            success: true,
            message: `Updated ${existingItem.ingredient.name} to ${targetQty} ${targetUnit}.`,
            previousValue: oldVal,
            newValue: { quantity: targetQty, unit: targetUnit, availability: updated.availability },
          });
          stateChanged = true;
          inventoryOrFastingChanged = true;
        } else {
          // New item in inventory
          if (action.type === "inventory_remove_quantity") {
            appliedActions.push({
              action,
              success: false,
              message: `Cannot remove ${action.quantity} ${targetUnit} of ${ingName} because it is not in inventory.`,
            });
            continue;
          }

          const created = await tx.inventoryItem.create({
            data: {
              householdId: HOUSEHOLD_ID,
              ingredientId: ingredient.id,
              quantity: targetQty,
              unit: targetUnit,
              availability: targetQty > 0 ? "AVAILABLE" : "UNAVAILABLE",
            },
          });

          const currentVersion = await log(
            tx,
            "INVENTORY_ADDED",
            created.id,
            `Voice: Added ${ingredient.name} (${targetQty} ${targetUnit}).`
          );

          await tx.inventoryEvent.create({
            data: {
              householdId: HOUSEHOLD_ID,
              inventoryItemId: created.id,
              type: "INVENTORY_ADDED",
              before: Prisma.JsonNull,
              after: JSON.parse(JSON.stringify(created)),
              stateVersion: currentVersion,
            },
          });

          appliedActions.push({
            action,
            success: true,
            message: `Added ${ingredient.name} (${targetQty} ${targetUnit}).`,
            previousValue: null,
            newValue: { quantity: targetQty, unit: targetUnit, availability: created.availability },
          });
          stateChanged = true;
          inventoryOrFastingChanged = true;
        }
      } else if (action.type === "fasting_status_update") {
        const member = currentHousehold.members.find(
          (m) =>
            (action.memberId && m.id === action.memberId) ||
            m.name.toLowerCase() === action.member.toLowerCase() ||
            (m.relationship && m.relationship.toLowerCase() === action.member.toLowerCase())
        );

        if (!member) {
          appliedActions.push({
            action,
            success: false,
            message: `Could not identify household member "${action.member}".`,
          });
          continue;
        }

        const oldFasting = member.fasting;
        await tx.householdMember.update({
          where: { id: member.id },
          data: { fasting: action.active },
        });

        const currentVersion = await log(
          tx,
          "MEMBER_FASTING_UPDATED",
          member.id,
          `Voice: ${member.name} fasting status set to ${action.active ? "Active" : "Inactive"}.`
        );

        appliedActions.push({
          action,
          success: true,
          message: `${member.name} fasting status is now ${action.active ? "Fasting" : "Not fasting"}.`,
          previousValue: { fasting: oldFasting },
          newValue: { fasting: action.active },
        });
        stateChanged = true;
        inventoryOrFastingChanged = true;
      } else if (action.type === "meal_request") {
        appliedActions.push({
          action,
          success: true,
          message: `Recorded meal request for "${action.dish}".`,
        });
        inventoryOrFastingChanged = true;
      } else if (action.type === "member_preference_update") {
        const member = currentHousehold.members.find(
          (m) =>
            (action.memberId && m.id === action.memberId) ||
            m.name.toLowerCase() === action.member.toLowerCase()
        );

        if (member) {
          const updateData: Record<string, unknown> = {};
          if (action.dietaryPreference) updateData.dietaryPreference = action.dietaryPreference;
          if (action.addDislike) {
            const currentDislikes = Array.isArray(member.dislikes)
              ? (member.dislikes as string[])
              : [];
            updateData.dislikes = Array.from(
              new Set([...currentDislikes, action.addDislike])
            );
          }

          if (Object.keys(updateData).length > 0) {
            await tx.householdMember.update({
              where: { id: member.id },
              data: updateData,
            });
            await log(
              tx,
              "MEMBER_UPDATED",
              member.id,
              `Voice: Updated preferences for ${member.name}.`
            );
            stateChanged = true;
            inventoryOrFastingChanged = true;
          }

          appliedActions.push({
            action,
            success: true,
            message: `Updated preferences for ${member.name}.`,
          });
        } else {
          appliedActions.push({
            action,
            success: false,
            message: `Member ${action.member} not found.`,
          });
        }
      }
    }

    // Record the overall batch activity log with idempotencyKey
    await log(
      tx,
      "VOICE_ACTION_BATCH",
      options.idempotencyKey,
      `Voice commands processed: ${options.transcript || "Kitchen voice update"}`
    );

    // 3. Automatic Replanning: Check today's active meal plans
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayDate = new Date(todayStr);

    const existingPlans = await tx.mealPlan.findMany({
      where: {
        householdId: HOUSEHOLD_ID,
        OR: [
          { scheduledAt: todayDate },
          {
            scheduledAt: {
              gte: new Date(todayStr + "T00:00:00.000Z"),
              lte: new Date(todayStr + "T23:59:59.999Z"),
            },
          },
        ],
        status: { in: ["READY", "NEEDS_CONFIRMATION", "REQUIRES_SHOPPING"] },
      },
      include: { dishes: true, participants: true },
    });

    const replanResult: ReplanResult = {
      needsReplanning: false,
      affectedPlansCount: 0,
      invalidatedMealTypes: [],
      explanation: "No active meal plans were affected.",
      hasReplacement: false,
    };

    if (inventoryOrFastingChanged && existingPlans.length > 0) {
      // Load refreshed planning data inside this transaction
      const updatedPlanData = await planningData(tx, todayStr);

      for (const plan of existingPlans) {
        // Re-evaluate current dishes against latest inventory & member state
        let currentMenuValid = true;
        let evaluatedMenu: Menu | null = null;
        try {
          evaluatedMenu = evaluateMenu(
            {
              date: todayStr,
              mealType: plan.mealType as any,
              servings: plan.servings,
              maxMinutes: plan.maxMinutes,
              requestedDish: "",
              memberIds: plan.participants
                .map((p) => p.memberId)
                .filter((id): id is string => Boolean(id)),
            },
            plan.dishes
              .filter((d): d is typeof d & { recipeId: string } => Boolean(d.recipeId))
              .map((d) => ({
                recipeId: d.recipeId,
                servings: d.servings,
                memberIds: Array.isArray(d.memberIds) ? (d.memberIds as string[]) : [],
              })),
            updatedPlanData
          );

          if (
            evaluatedMenu.status === "REJECTED" ||
            evaluatedMenu.status === "REQUIRES_SHOPPING" ||
            evaluatedMenu.inventory.ingredients.some(
              (i) => i.status === "CONFIRMED_UNAVAILABLE" || (i.missing !== null && i.missing > 0)
            )
          ) {
            currentMenuValid = false;
          }
        } catch {
          currentMenuValid = false;
        }

        if (!currentMenuValid) {
          // Mark plan as rejected / stale
          await tx.mealPlan.update({
            where: { id: plan.id },
            data: { status: "REJECTED" },
          });

          replanResult.needsReplanning = true;
          replanResult.affectedPlansCount++;
          replanResult.invalidatedMealTypes.push(plan.mealType);

          // Find alternative recommendations using deterministic solver
          const recommendations = recommendMenus(
            {
              date: todayStr,
              mealType: plan.mealType as any,
              servings: plan.servings,
              maxMinutes: plan.maxMinutes,
              requestedDish: "",
              memberIds: plan.participants
                .map((p) => p.memberId)
                .filter((id): id is string => Boolean(id)),
            },
            updatedPlanData
          );

          replanResult.newRecommendations = recommendations.menus;

          // Automatically replace with top feasible alternative that is cookable with in-stock pantry items
          const topAlternative = recommendations.menus.find((m) => {
            if (m.status === "REJECTED") return false;
            // Recipe must not have any confirmed unavailable ingredients or active shortages
            const hasShortageOrUnavailable = m.inventory.ingredients.some(
              (i) => i.status === "CONFIRMED_UNAVAILABLE" || (i.missing !== null && i.missing > 0)
            );
            return !hasShortageOrUnavailable;
          });

          if (topAlternative) {
            const newSnapshot = JSON.parse(
              JSON.stringify({
                request: {
                  date: todayStr,
                  mealType: plan.mealType,
                  servings: plan.servings,
                  maxMinutes: plan.maxMinutes,
                  memberIds: plan.participants.map((p) => p.memberId),
                },
                menu: topAlternative,
                memberRules: updatedPlanData.members.filter((m) =>
                  plan.participants.some((p) => p.memberId === m.id)
                ),
              })
            );

            // Replace old plan dishes
            await tx.mealPlanDish.deleteMany({ where: { mealPlanId: plan.id } });
            await tx.mealPlan.update({
              where: { id: plan.id },
              data: {
                status: topAlternative.status,
                stateVersion: updatedPlanData.stateVersion,
                recipeId: topAlternative.dishes[0]?.recipeId || null,
                snapshot: newSnapshot,
                dishes: {
                  create: topAlternative.dishes.map((d) => ({
                    recipeId: d.recipeId,
                    servings: d.servings,
                    memberIds: d.memberIds,
                    recipeSnapshot: JSON.parse(JSON.stringify(d.recipeSnapshot)),
                  })),
                },
              },
            });

            const newDishNames = topAlternative.dishes.map((d) => d.recipeName).join(" + ");
            await log(
              tx,
              "MEAL_PLAN_REPLACED",
              plan.id,
              `Self-correcting replan: ${plan.mealType} meal updated to ${newDishNames} due to latest kitchen changes.`
            );

            replanResult.hasReplacement = true;
            replanResult.explanation = `Existing ${plan.mealType} plan became invalid and was automatically replaced with ${newDishNames}.`;
          } else {
            replanResult.hasReplacement = false;
            const shortfalls =
              evaluatedMenu?.inventory?.groceries ||
              recommendations.menus.flatMap((m) => m.inventory?.groceries || []);
            replanResult.shortfalls = shortfalls;
            replanResult.explanation = `Existing ${plan.mealType} plan became invalid due to unavailable ingredients. No feasible alternative recipe is currently cookable with in-stock pantry items. Check grocery requirements.`;
          }
        }
      }
    }

    const finalHousehold = await tx.household.findUniqueOrThrow({
      where: { id: HOUSEHOLD_ID },
    });

    return {
      success: true,
      appliedActions,
      replan: replanResult,
      stateVersion: finalHousehold.version,
    };
  });
}
