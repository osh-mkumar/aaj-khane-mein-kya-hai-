import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { PrismaClient } from "@prisma/client";
import { normalizeIngredient } from "../src/lib/recipes/aliases";
import { ingredientCatalog } from "../src/lib/recipes/catalog";

const db = new PrismaClient();

const DATASET_URL =
  "https://prod-dcd-datasets-public-files-eu-west-1.s3.eu-west-1.amazonaws.com/55458a79-9e17-4d12-8b25-0b2ffc7d9485";
const DATASET_DIR = path.resolve(process.cwd(), "data");
const DATASET_PATH = path.join(DATASET_DIR, "IndianFoodDatasetCSV.csv");

export interface MendeleyImportStats {
  totalInFile: number;
  totalParsed: number;
  importedCount: number;
  verifiedCount: number;
  incompleteCount: number;
  rejectedCount: number;
  cuisines: Record<string, number>;
  diets: Record<string, number>;
}

/**
 * Downloads the Mendeley dataset if not already present on disk.
 */
export async function ensureDatasetFile(): Promise<string> {
  if (fs.existsSync(DATASET_PATH)) {
    const stat = fs.statSync(DATASET_PATH);
    if (stat.size > 1000000) {
      console.log(`[Dataset] Using cached Mendeley dataset at ${DATASET_PATH} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
      return DATASET_PATH;
    }
  }

  if (!fs.existsSync(DATASET_DIR)) {
    fs.mkdirSync(DATASET_DIR, { recursive: true });
  }

  console.log(`[Dataset] Downloading IndianFoodDatasetCSV.csv from Mendeley S3 mirror...`);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(DATASET_PATH);
    https
      .get(DATASET_URL, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with status ${res.statusCode}`));
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          console.log(`[Dataset] Download complete.`);
          resolve(DATASET_PATH);
        });
      })
      .on("error", (err) => {
        fs.unlink(DATASET_PATH, () => {});
        reject(err);
      });
  });
}

/**
 * Robust state-machine CSV parser for multiline quoted text.
 */
export function parseCSV(content: string, limit = Infinity): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.length > 1 || currentRow[0] !== "") {
        rows.push(currentRow);
        if (rows.length >= limit) break;
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

/**
 * Parses fractional or decimal quantity strings e.g. "2-1/2", "1/2", "500", "1.5".
 */
export function parseQuantity(str: string | null): number | null {
  if (!str) return null;
  const s = str.trim().replace(/\s*\/\s*/g, "/");
  const mixed = s.match(/^(\d+)[\s\-]+(\d+)\/(\d+)$/);
  if (mixed) {
    const base = parseFloat(mixed[1]);
    const frac = parseFloat(mixed[2]) / parseFloat(mixed[3]);
    return base + frac;
  }
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    return parseFloat(frac[1]) / parseFloat(frac[2]);
  }
  const num = parseFloat(s);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * Standardizes units into RasoiOS accepted unit tokens.
 */
export function standardizeUnit(rawUnit: string): string {
  const u = rawUnit.toLowerCase().trim();
  if (/^cups?$/.test(u)) return "cup";
  if (/^(tablespoons?|tbsp)$/.test(u)) return "tbsp";
  if (/^(teaspoons?|tsp)$/.test(u)) return "tsp";
  if (/^(grams?|gms?|g)$/.test(u)) return "g";
  if (/^(kilograms?|kilos?|kg)$/.test(u)) return "kg";
  if (/^(millilitres?|milliliters?|ml)$/.test(u)) return "ml";
  if (/^(litres?|liters?|l)$/.test(u)) return "l";
  if (/^(cloves?)$/.test(u)) return "clove";
  if (/^(inches?|inch)$/.test(u)) return "inch";
  if (/^(sprigs?)$/.test(u)) return "sprig";
  if (/^(pinch)$/.test(u)) return "pinch";
  return "piece";
}

/**
 * Parses a single ingredient line from TranslatedIngredients.
 */
export function parseIngredient(rawItem: string): {
  canonicalId: string;
  name: string;
  quantity: number | null;
  unit: string;
  hasKnownQty: boolean;
} {
  const trimmed = rawItem.trim().replace(/\s+/g, " ");

  // Normalizes "2 - 1/2" or "1 / 2"
  const normalized = trimmed.replace(/(\d+)\s*-\s*(\d+)\s*\/\s*(\d+)/g, "$1-$2/$3");

  const qtyMatch = normalized.match(
    /^([0-9]+(?:[\s\-]+[0-9]+\/[0-9]+)?|\b[0-9]+\/[0-9]+\b|\b[0-9]+(?:\.[0-9]+)?\b)/
  );

  let qtyStr: string | null = null;
  let rest = normalized;

  if (qtyMatch) {
    qtyStr = qtyMatch[0].trim();
    rest = normalized.slice(qtyMatch[0].length).trim();
  }

  const unitMatch = rest.match(
    /^(cups?|tablespoons?|teaspoons?|tbsp|tsp|grams?|gms?|kg|kilo|litres?|liters?|ml|inches?|inch|cloves?|sprigs?|pinch|to taste|as required)\b/i
  );

  let rawUnit = "piece";
  if (unitMatch) {
    rawUnit = unitMatch[0].toLowerCase();
    rest = rest.slice(unitMatch[0].length).trim();
  }

  // Strip leading punctuation and conjunctions
  rest = rest.replace(/^[\s\-\–\—\:]+/, "").replace(/^of\s+/i, "").trim();

  // Strip prep instructions after dash (e.g., "- chopped", "- deseeded")
  const dashParts = rest.split(/\s*[\-\–\—]\s*/);
  let cleanedName = dashParts[0].trim();

  // Strip parentheticals e.g. "(besan)" or "(Bitter Gourd)"
  cleanedName = cleanedName.replace(/\s*\([^)]*\)/g, "").trim();

  if (!cleanedName || cleanedName.length < 2) {
    cleanedName = rest || "Spices";
  }

  const qty = parseQuantity(qtyStr);
  const unit = standardizeUnit(rawUnit);
  const canonicalId = normalizeIngredient(cleanedName);

  return {
    canonicalId,
    name: cleanedName,
    quantity: qty,
    unit,
    hasKnownQty: qty !== null && qty > 0,
  };
}

/**
 * Infers category from course/cuisine.
 */
function inferMealCategory(course: string): string {
  const c = course.toLowerCase();
  if (c.includes("breakfast")) return "Breakfast";
  if (c.includes("snack") || c.includes("appetizer")) return "Snack";
  if (c.includes("dessert")) return "Dessert";
  if (c.includes("side")) return "Side Dish";
  return "Main Course";
}

/**
 * Creates slug ID from title.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);
}

/**
 * Main import runner.
 */
export async function importMendeleyRecipes(options: {
  maxImport?: number;
  skipDbWrite?: boolean;
} = {}): Promise<MendeleyImportStats> {
  const filePath = await ensureDatasetFile();
  const content = fs.readFileSync(filePath, "utf8");

  console.log(`[Dataset] Parsing CSV records...`);
  const rows = parseCSV(content);

  const header = rows[0];
  const dataRows = rows.slice(1);

  const stats: MendeleyImportStats = {
    totalInFile: 6871,
    totalParsed: dataRows.length,
    importedCount: 0,
    verifiedCount: 0,
    incompleteCount: 0,
    rejectedCount: 0,
    cuisines: {},
    diets: {},
  };

  // Find existing recipe names to avoid overwriting curated LOCAL recipes
  const existingRecipes = await db.recipe.findMany({
    select: { id: true, name: true, source: true },
  });
  const existingNames = new Set(existingRecipes.map((r) => r.name.toLowerCase().trim()));
  const existingIds = new Set(existingRecipes.map((r) => r.id));

  const targetLimit = options.maxImport ?? 100;
  console.log(`[Dataset] Starting import (target: ${targetLimit} balanced recipes, total dataset: ${dataRows.length})...`);

  // We want a diverse set representing North, South, Gujarati, Bengali, Maharashtrian, etc.
  const balancedSelection: string[][] = [];
  const incompleteSample: string[][] = [];

  for (const row of dataRows) {
    if (row.length < 14) {
      stats.rejectedCount++;
      continue;
    }

    const recipeName = (row[2] || row[1] || "").trim();
    if (!recipeName || existingNames.has(recipeName.toLowerCase())) {
      stats.rejectedCount++;
      continue;
    }

    const cuisine = (row[9] || "Indian").trim();
    const diet = (row[11] || "Vegetarian").trim();
    stats.cuisines[cuisine] = (stats.cuisines[cuisine] || 0) + 1;
    stats.diets[diet] = (stats.diets[diet] || 0) + 1;

    const prepTime = parseInt(row[5], 10) || 0;
    const cookTime = parseInt(row[6], 10) || 0;
    const servings = parseInt(row[8], 10) || 0;
    const ingText = (row[4] || row[3] || "").trim();
    const instText = (row[13] || row[12] || "").trim();

    const isComplete = prepTime > 0 && cookTime > 0 && servings > 0 && ingText.length > 5 && instText.length > 10;

    if (isComplete) {
      stats.verifiedCount++;
      if (balancedSelection.length < targetLimit - 10) {
        balancedSelection.push(row);
      }
    } else {
      stats.incompleteCount++;
      // Save a few incomplete ones to satisfy "incomplete recipes may be displayed as inspiration" requirement
      if (incompleteSample.length < 10) {
        incompleteSample.push(row);
      }
    }
  }

  const recipesToImport = [...balancedSelection, ...incompleteSample];

  if (options.skipDbWrite) {
    console.log(`[Dataset] Skip DB write requested. Summary generated.`);
    return stats;
  }

  // Insert into DB
  let imported = 0;
  for (const row of recipesToImport) {
    const rawName = (row[2] || row[1] || "").trim();
    let baseSlug = `mendeley-${slugify(rawName)}`;
    let finalId = baseSlug;
    let counter = 1;
    while (existingIds.has(finalId)) {
      finalId = `${baseSlug}-${counter++}`;
    }
    existingIds.add(finalId);
    existingNames.add(rawName.toLowerCase());

    const prepTime = parseInt(row[5], 10) || 0;
    const cookTime = parseInt(row[6], 10) || 0;
    const servings = parseInt(row[8], 10) || 4;
    const cuisine = (row[9] || "Indian").trim();
    const course = (row[10] || "Main Course").trim();
    const diet = (row[11] || "Vegetarian").trim();
    const ingText = (row[4] || row[3] || "").trim();
    const instText = (row[13] || row[12] || "").trim();
    const url = (row[14] || "").trim();

    // Parse ingredients
    const rawIngs = ingText.split(/,(?![^\(\[]*[\]\)])/);
    const parsedIngs = rawIngs
      .map((i) => parseIngredient(i))
      .filter((i) => i.name.length > 0);

    // Deduplicate ingredients by canonicalId within the recipe
    const dedupedIngsMap = new Map<string, typeof parsedIngs[0]>();
    for (const ing of parsedIngs) {
      if (dedupedIngsMap.has(ing.canonicalId)) {
        const existing = dedupedIngsMap.get(ing.canonicalId)!;
        if (
          existing.quantity !== null &&
          ing.quantity !== null &&
          existing.unit === ing.unit
        ) {
          existing.quantity += ing.quantity;
        }
      } else {
        dedupedIngsMap.set(ing.canonicalId, { ...ing });
      }
    }
    const dedupedIngs = Array.from(dedupedIngsMap.values());

    const issues: string[] = [];
    if (prepTime <= 0) issues.push("Prep time is unspecified.");
    if (cookTime <= 0) issues.push("Cook time is unspecified.");
    if (dedupedIngs.some((i) => !i.hasKnownQty)) {
      issues.push(
        "Some ingredients have non-authoritative or 'to taste' quantities."
      );
    }

    const isComplete =
      issues.length === 0 && dedupedIngs.length > 0 && instText.length > 10;

    // Split instructions into numbered steps
    let steps = instText
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 8);

    if (steps.length === 0) {
      steps = [instText || "Follow standard Indian cooking preparation."];
    }

    // Build dietary tags
    const tags = [diet, cuisine, course].filter(Boolean);
    if (!isComplete) tags.push("Incomplete - Inspiration Only");

    const dietaryMetadata = {
      diet,
      cuisine,
      course,
      tags,
      isComplete,
      isVerified: isComplete,
      completenessIssues: issues,
      attribution:
        "Mendeley Data: 6000+ Indian Food Recipes Dataset by Kanishka Jain (CC BY 4.0), Archana's Kitchen",
      sourceUrl: url,
    };

    try {
      // Upsert ingredients
      for (const ing of dedupedIngs) {
        const catalogEntry = ingredientCatalog[ing.canonicalId];
        const ingName = catalogEntry ? catalogEntry[0] : ing.name;
        const ingCategory = catalogEntry ? catalogEntry[1] : "Vegetables";

        await db.ingredient.upsert({
          where: { id: ing.canonicalId },
          create: {
            id: ing.canonicalId,
            name: ingName,
            category: ingCategory,
          },
          update: {},
        });
      }

      await db.recipe.create({
        data: {
          id: finalId,
          name: rawName,
          description: `${rawName} (${cuisine} ${course}). ${isComplete ? "Verified recipe." : "Dataset inspiration record."}`,
          mealCategory: inferMealCategory(course),
          defaultServings: servings > 0 ? servings : 4,
          prepMinutes: prepTime,
          cookMinutes: cookTime,
          advancePreparation: "None",
          dietaryMetadata,
          substitutions: [],
          source: "MENDELEY",
          preferredLanguage: "English",
          ingredients: {
            create: dedupedIngs.map((ing) => ({
              ingredientId: ing.canonicalId,
              quantity: ing.quantity ?? 1, // Fallback non-zero for schema constraints, marked unknown in metadata
              unit: ing.unit,
            })),
          },
          instructions: {
            create: steps.map((text, idx) => ({
              position: idx,
              text,
            })),
          },
        },
      });

      imported++;
    } catch (err) {
      console.warn(`Failed to insert recipe ${rawName}:`, err);
    }
  }

  stats.importedCount = imported;
  console.log(`[Dataset] Successfully imported ${imported} Mendeley recipes into SQLite!`);
  return stats;
}

if (process.argv[1]?.includes("import-mendeley")) {
  importMendeleyRecipes()
    .then((stats) => {
      console.log("\n================ MENDELEY IMPORT SUMMARY ================");
      console.log(`Total Dataset Records: ${stats.totalParsed}`);
      console.log(`Complete & Verified in Dataset: ${stats.verifiedCount}`);
      console.log(`Incomplete in Dataset: ${stats.incompleteCount}`);
      console.log(`Successfully Imported into DB: ${stats.importedCount}`);
      console.log("=========================================================\n");
    })
    .catch((err) => {
      console.error("Import error:", err);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
