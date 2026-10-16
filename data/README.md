# Mendeley Indian Recipe Dataset

## Source & Attribution
- **Dataset Title**: Indian Recipe Dataset with Translated Ingredients and Instructions
- **Authors**: Kanishka Jain
- **Original Source**: Archana's Kitchen recipes dataset
- **Repository**: Mendeley Data
- **DOI / Link**: [Mendeley Data xsphgmmh7b.1](https://data.mendeley.com/datasets/xsphgmmh7b/1/files/6fb5ae32-a815-4b8f-9d68-8d512227eac8)
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)

## File Information
- **File Name**: `IndianFoodDatasetCSV.csv`
- **Format**: Comma-Separated Values (CSV, UTF-8, multiline quoted fields)
- **Size**: ~24.15 MB (6,871 recipe rows + 1 header row)
- **Columns (15)**:
  1. `Srno`: Serial identifier
  2. `RecipeName`: Original recipe name
  3. `TranslatedRecipeName`: English translated recipe name
  4. `Ingredients`: Original ingredients text
  5. `TranslatedIngredients`: English translated ingredients list (comma-separated entries with quantities)
  6. `PrepTimeInMins`: Preparation time in minutes
  7. `CookTimeInMins`: Cooking time in minutes
  8. `TotalTimeInMins`: Total time in minutes
  9. `Servings`: Default number of servings
  10. `Cuisine`: Regional cuisine (e.g., North Indian, South Indian, Bengali, Maharashtrian, Gujarati, etc.)
  11. `Course`: Meal course (e.g., Main Course, Side Dish, Appetizer, Snack, Dessert)
  12. `Diet`: Broad dietary label (e.g., Vegetarian, High Protein Vegetarian, Diabetic Friendly, Non Vegeterian, Vegan)
  13. `Instructions`: Original recipe instructions
  14. `TranslatedInstructions`: English translated step-by-step instructions
  15. `URL`: Original recipe web source URL

## Reproducible Ingestion
The dataset can be automatically downloaded and ingested via:
```bash
npm run db:import-mendeley
```
This script handles multiline quoted CSV parsing, canonical ingredient normalization, quantity parsing (including fractions like `2-1/2` and decimals), unit conversion, and deduplication.
