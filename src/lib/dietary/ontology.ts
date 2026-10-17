import { ingredientCatalog } from "../recipes/catalog";
import { normalizeIngredient } from "../recipes/aliases";
import { canonical } from "../validation";
type Knowledge = {
  name: string;
  category: string;
  categories: string[];
  allergens: string[];
  uncertain: boolean;
};
const extra: Record<string, [string, string]> = {
  milk: ["Milk", "Dairy"],
  butter: ["Butter", "Dairy"],
  cream: ["Cream", "Dairy"],
  honey: ["Honey", "Animal products"],
  fish: ["Fish", "Fish"],
  prawn: ["Prawn", "Seafood"],
  gelatin: ["Gelatin", "Animal products"],
  beef: ["Beef", "Meat"],
  mutton: ["Mutton", "Meat"],
  pork: ["Pork", "Meat"],
  radish: ["Radish", "Root vegetables"],
  beetroot: ["Beetroot", "Root vegetables"],
  sesame: ["Sesame", "Seeds"],
  soy: ["Soy", "Pulses"],
  tofu: ["Tofu", "Pulses"],
  almonds: ["Almonds", "Nuts"],
  cashews: ["Cashews", "Nuts"],
  "sunflower-oil": ["Sunflower oil", "Oils"],
  "peanut-oil": ["Peanut oil", "Oils"],
  "mustard-oil": ["Mustard oil", "Oils"],
};
export const knownIngredients: Record<string, Knowledge> = Object.fromEntries(
  Object.entries({ ...ingredientCatalog, ...extra }).map(
    ([id, [name, category]]) => {
      const cat = canonical(category);
      const categories = [cat];
      if (["root-vegetables", "leafy-greens", "alliums"].includes(cat))
        categories.push("vegetables");
      if (
        [
          "meat",
          "fish",
          "seafood",
          "dairy",
          "eggs",
          "animal-products",
        ].includes(cat)
      )
        categories.push("animal-derived");
      const allergens: string[] = [];
      if (cat === "dairy") allergens.push("milk", "dairy");
      if (cat === "eggs") allergens.push("egg", "eggs");
      if (["wheat-flour", "semolina"].includes(id))
        allergens.push("wheat", "gluten");
      if (id === "peanuts") allergens.push("peanuts");
      if (id === "peanut-oil") allergens.push("peanuts");
      if (["mustard-seeds", "mustard-oil"].includes(id))
        allergens.push("mustard-seeds");
      if (["almonds", "cashews"].includes(id)) allergens.push("tree-nuts", id);
      if (["soy", "tofu"].includes(id)) allergens.push("soy");
      if (id === "sesame") allergens.push("sesame");
      if (cat === "fish") allergens.push("fish");
      if (cat === "seafood") allergens.push("shellfish");
      return [
        id,
        {
          name,
          category,
          categories,
          allergens,
          uncertain: id === "garam-masala",
        },
      ];
    },
  ),
);
export function ingredientKnowledge(id: string) {
  return knownIngredients[normalizeIngredient(id)];
}
export const knownCategories = new Set(
  Object.values(knownIngredients).flatMap((k) => k.categories),
);
export function normalizeCategory(value: string) {
  const key = canonical(value);
  return (
    (
      {
        "root-vegetable": "root-vegetables",
        roots: "root-vegetables",
        egg: "eggs",
        milk: "dairy",
        "sea-food": "seafood",
        "animal-products": "animal-derived",
        nut: "nuts",
      } as Record<string, string>
    )[key] ?? key
  );
}
export const allergyAliases: Record<string, string> = {
  "milk-protein": "milk",
  lactose: "milk",
  peanut: "peanuts",
  groundnuts: "peanuts",
  nuts: "nuts",
  "tree-nut": "tree-nuts",
  eggs: "egg",
  soya: "soy",
  mustard: "mustard-seeds",
  "shell-fish": "shellfish",
};
export function normalizeAllergy(value: string) {
  const key = normalizeIngredient(value);
  return allergyAliases[key] ?? key;
}
export const understoodAllergies = new Set([
  ...Object.keys(knownIngredients),
  "milk",
  "dairy",
  "wheat",
  "gluten",
  "peanuts",
  "nuts",
  "tree-nuts",
  "egg",
  "soy",
  "sesame",
  "fish",
  "shellfish",
]);
