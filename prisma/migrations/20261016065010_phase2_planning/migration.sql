-- AlterTable
ALTER TABLE "FastingRule" ADD COLUMN "endsOn" TEXT;
ALTER TABLE "FastingRule" ADD COLUMN "mealType" TEXT;
ALTER TABLE "FastingRule" ADD COLUMN "startsOn" TEXT;

-- CreateTable
CREATE TABLE "MealPlanDish" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mealPlanId" TEXT NOT NULL,
    "recipeId" TEXT,
    "servings" INTEGER NOT NULL,
    "memberIds" JSONB NOT NULL,
    "recipeSnapshot" JSONB NOT NULL,
    CONSTRAINT "MealPlanDish_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MealPlanDish_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecipeGenerationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestedDish" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL,
    "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warnings" JSONB NOT NULL,
    CONSTRAINT "RecipeGenerationRecord_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeGenerationRecord_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HouseholdMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT,
    "dietaryPreference" TEXT NOT NULL,
    "allergies" JSONB NOT NULL,
    "dislikes" JSONB NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'Hindi',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "participating" BOOLEAN NOT NULL DEFAULT true,
    "fasting" BOOLEAN NOT NULL DEFAULT false,
    "allowEggs" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HouseholdMember" ("active", "allergies", "createdAt", "dietaryPreference", "dislikes", "fasting", "householdId", "id", "name", "participating", "preferredLanguage", "relationship", "updatedAt") SELECT "active", "allergies", "createdAt", "dietaryPreference", "dislikes", "fasting", "householdId", "id", "name", "participating", "preferredLanguage", "relationship", "updatedAt" FROM "HouseholdMember";
DROP TABLE "HouseholdMember";
ALTER TABLE "new_HouseholdMember" RENAME TO "HouseholdMember";
CREATE TABLE "new_MealPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "recipeId" TEXT,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "stateVersion" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL DEFAULT 'dinner',
    "servings" INTEGER NOT NULL DEFAULT 1,
    "maxMinutes" INTEGER NOT NULL DEFAULT 60,
    "snapshot" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MealPlan_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MealPlan" ("householdId", "id", "recipeId", "scheduledAt", "stateVersion", "status") SELECT "householdId", "id", "recipeId", "scheduledAt", "stateVersion", "status" FROM "MealPlan";
DROP TABLE "MealPlan";
ALTER TABLE "new_MealPlan" RENAME TO "MealPlan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RecipeGenerationRecord_recipeId_key" ON "RecipeGenerationRecord"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeGenerationRecord_householdId_requestKey_key" ON "RecipeGenerationRecord"("householdId", "requestKey");
