import { canonical } from "../validation";
const dishAliases: Record<string, string> = {
  "tadka-dal": "dal-tadka",
  "dal-fry": "dal-tadka",
  "aloo-ki-sabzi": "aloo-sabzi",
  "alu-sabzi": "aloo-sabzi",
  "jeera-chawal": "jeera-rice",
  "cumin-rice": "jeera-rice",
  "palak-paneer-curry": "palak-paneer",
  chapati: "roti",
  chapatti: "roti",
  "rajma-masala": "rajma",
  "chana-masala": "chole",
  "sabudana-khichadi": "sabudana-khichdi",
  "veg-khichdi": "vegetable-khichdi",
  "vegetable-khichadi": "vegetable-khichdi",
};
const ingredientAliases: Record<string, string> = {
  "basmati-rice": "rice",
  chawal: "rice",
  atta: "wheat-flour",
  "whole-wheat-flour": "wheat-flour",
  jeera: "cumin",
  "cumin-seeds": "cumin",
  haldi: "turmeric",
  "turmeric-powder": "turmeric",
  pyaz: "onion",
  onions: "onion",
  lahsun: "garlic",
  aloo: "potato",
  potatoes: "potato",
  carrots: "carrot",
  palak: "spinach",
  groundnuts: "peanuts",
  groundnut: "peanuts",
  peanut: "peanuts",
  curd: "yogurt",
  dahi: "yogurt",
  eggs: "egg",
  "tapioca-pearls": "sabudana",
  sago: "sabudana",
  "arhar-dal": "toor-dal",
  "tuvar-dal": "toor-dal",
  sooji: "semolina",
  rava: "semolina",
  "flattened-rice": "poha",
  "kabuli-chana": "chickpeas",
  "rajma-beans": "kidney-beans",
  lauki: "bottle-gourd",
  "bell-pepper": "capsicum",
  "coriander-leaves": "coriander",
  cilantro: "coriander",
  "sendha-namak": "rock-salt",
  "red-chilli-powder": "chilli-powder",
  "chili-powder": "chilli-powder",
  "clarified-butter": "ghee",
  "green-chilies": "green-chilli",
  "green-chillies": "green-chilli",
  water: "water",
  "milk-products": "dairy",
  milk: "milk",
  wheat: "wheat",
  gluten: "gluten",
  "egg-allergy": "egg",
};
export function normalizeDish(name: string) {
  const key = name
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return dishAliases[key] ?? key;
}
export function normalizeIngredient(name: string) {
  const key = canonical(name);
  return ingredientAliases[key] ?? key;
}
