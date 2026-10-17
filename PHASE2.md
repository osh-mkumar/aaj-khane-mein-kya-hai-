# RasoiOS Phase 2 — implementation and handoff

Phase 2 extends the existing Next.js/Prisma application. The existing household, recipes, inventory, IDs and overrides are preserved. No reset or replacement seed was used.

## Run and upgrade

Stop a running development server before Prisma client generation on Windows; otherwise its engine DLL may be locked.

```powershell
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
```

Preserve your existing `.env`. On a fresh checkout, copy `.env.example` and run `npm.cmd run db:setup` once. Existing demo data is not reseeded or overwritten. Open http://127.0.0.1:3000/meal-planner.

## Screens

- **Meal Planner:** breakfast/lunch/snack/dinner, date, active participants, total servings, preparation/cooking limit, optional requested dish, explicit AI language/cuisine inputs, deterministic recommendations, per-person compatibility, exclusions, ingredient checklist and groceries, steps, ranking explanation, conditional-plan acknowledgement and save/reopen.
- **Recipe Library:** local/household/AI source filters, adjustable serving analysis, date/meal-specific checks for selected participants, household customization, original-recipe viewing and reset-to-original preference. Reset keeps the custom copy and does not delete either version. Editing a retained copy makes it preferred again.
- **Household:** vegetarian egg allowance, fasting date range and meal scope, configurable whitelists/prohibitions. Existing allergies, dislikes and explicit exclusions remain separate.
- **Dashboard:** the newest saved plan for each meal type today, with ingredient requirements and a clear saved-snapshot label. It does not pretend historical stock is current.

## Core modules

| Module                                                             | Responsibility                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `src/lib/recipes/aliases.ts`                                       | Dish and ingredient aliases, Unicode-safe dish normalization                                                      |
| `src/lib/recipes/resolver.ts`                                      | Preferred household copy → local recipe → previously saved AI recipe; no automatic AI calls                       |
| `src/lib/recipes/scaler.ts`                                        | Serving scaling with Decimal arithmetic and invalid-quantity review flags                                         |
| `src/lib/dietary/ontology.ts`                                      | Curated ingredient categories, derived allergens and unverified compounds; ignores model-supplied category claims |
| `src/lib/dietary/verifier.ts`                                      | Independent hard-rule evaluation for every assigned participant                                                   |
| `src/lib/groceries/aggregator.ts`                                  | Canonical ingredient aggregation across dishes before stock comparison                                            |
| `src/lib/inventory/availability.ts`                                | Confirmed stock, shortages, unknowns, incompatible units and use-by dates                                         |
| `src/lib/meals/planner.ts`                                         | Pure, deterministic shared/two-dish evaluation and recommendation                                                 |
| `src/lib/meals/scoring.ts`                                         | Transparent normalized soft scoring, applied only after hard classification                                       |
| `src/lib/meals/service.ts`                                         | Scoped database reads, revalidation and transactional plan snapshots                                              |
| `src/lib/ai/openai-client.ts`                                      | Server-only official SDK Responses API, timeout, structured output and safe errors                                |
| `src/lib/ai/recipe-schema.ts`                                      | Strict wire schema without unsupported Zod string transformations                                                 |
| `src/lib/recipes/generator.ts`                                     | Draft validation, deterministic checks, caching, explicit save/discard and provenance                             |
| `src/lib/validation/planning.ts`                                   | Strict request schemas                                                                                            |
| `src/components/meals/*`                                           | Planner, menu cards, dietary indicators, checklist and dashboard integration                                      |
| `src/components/recipes/RecipeAnalysis.tsx`, `RecipeGenerator.tsx` | Interactive recipe review and generation                                                                          |

## Dietary decisions

Results are `VERIFIED`, `REJECTED` or `NEEDS_CONFIRMATION`. A model label is never evidence of compatibility.

- Vegetarian excludes meat, fish, seafood, gelatin and eggs by default. Its explicit egg option can allow eggs, but never over an allergy or exclusion. Eggetarian allows eggs. Non-vegetarian still respects every individual rule.
- Vegan excludes animal-derived ingredients, including dairy, eggs and honey.
- Jain uses a vegetarian baseline plus explicit individual restrictions. Root vegetables are excluded only when configured. No universally Jain-safe claim is made.
- No-onion/no-garlic rejects either ingredient. Satvik uses the vegetarian baseline and excludes onion/garlic; additional family practices must be configured.
- Fasting applies only while enabled and inside its optional date/meal window. Nonempty permitted ingredient/category lists form a whitelist (union). Every ingredient must match; prohibitions and allergies win. Include water, salt and fat only if actually permitted. Empty active fasting rules, unknown rule vocabulary and uncertain ingredient composition require confirmation.
- Milk allergy is checked against paneer, yogurt, ghee and other known dairy; wheat/gluten, peanut, tree-nut, soy, egg, fish, shellfish, sesame and mustard mappings are supported. Unknown allergies require clarification. Generic oil with an allergy requires source confirmation. Specific known oils can be recorded instead.
- The ontology is deliberately bounded. Unknown ingredients, unknown category restrictions and compound garam masala are not silently approved. Resolve a compound by using explicitly identified individual ingredients in the household version.
- This is an ingredient-level decision engine, not an allergen-free guarantee. Product labels, substitutions, cross-contact and the actual preparation must be reviewed separately.

The existing fictional grandmother has a narrow fasting whitelist. Selecting all four seeded members can legitimately yield no eligible menu. The engine does not silently loosen her rules. Choose a subset to explore recipes or configure her complete actual permitted list through Household.

## Quantities and inventory

Scale = base quantity × requested servings / base servings. Decimal arithmetic avoids premature display rounding; displayed amounts round to two decimal places. Fractional pieces are retained, not silently rounded up. Mass, volume and count dimensions cannot be mixed. Culinary conventions: 1 cup = 240 ml; 1 tbsp = 15 ml = 3 tsp; 1 L = 1000 ml; 1 kg = 1000 g.

Requirements are combined by canonical ingredient ID in g/ml/pieces before comparing stock. Conflicting dimensions for the same ingredient require review. Unavailable stock contributes zero even if its stored quantity is positive. Unknown availability, null quantity, missing records, incompatible units and stock past its use-by date on the planned meal date prevent a ready verdict. No record means unknown, not confirmed zero. Grocery lists show confirmed shortages and a separate confirmation list.

Nothing deducts inventory in Phase 2. This is true for recommendation, generation, plan saving and plan reopening.

## Recommendation policy

Ready menus rank before shopping-dependent menus, which rank before menus requiring confirmation. Hard dietary/time failures are excluded entirely. Within a readiness class, fewer dishes come first, then weighted score, then stable identifier order.

| Component    | Weight | Evidence                                                                                            |
| ------------ | -----: | --------------------------------------------------------------------------------------------------- |
| Preference   |   0.30 | Neutral 0.5 unless recorded ingredient/dish dislikes reduce it                                      |
| Freshness    |   0.25 | Fraction of required ingredients confirmed in stock with use-by dates within three days of the meal |
| Variety      |   0.20 | Recipes in saved plans in the previous seven days; 0.5 with no history                              |
| Convenience  |   0.15 | `max(0, 1 - totalMinutes / maxMinutes)`                                                             |
| Grocery cost |   0.10 | Neutral 0.5; no price data exists, so no costs are invented                                         |

Shared recipes are evaluated first. When none is ready, pairs are evaluated with a stable assignment policy: members who can eat only one candidate are assigned there; otherwise verified compatibility wins, then the smaller group. The result must cover every selected participant exactly once, give at least one serving per person and stay within the total time limit. Extra servings are apportioned by group size with a deterministic remainder. This is a two-dish accommodation planner, not an exhaustive menu optimizer or a main-plus-side portion model.

Preparation effort sums each dish’s prep/cook times sequentially. Soaking/marination requirements are displayed separately and must already be arranged. Estimates are stored recipe times, not promises about kitchen equipment or scaling to very large batches. Breakfast recipes can also be considered for snacks; breads are lunch/dinner candidates. An explicitly requested recipe may override its category, but never dietary, inventory or time checks.

## AI configuration and lifecycle

Add to server-side `.env` and restart:

```dotenv
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY="your-key"
OPENAI_MODEL="gpt-5-mini"
```

`gpt-5-mini` is the configurable default. The official [model documentation](https://developers.openai.com/api/docs/models/gpt-5-mini) lists Responses and structured-output support. The implementation uses the official SDK’s `responses.parse` and `zodTextFormat`, following [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Model/account access still depends on your OpenAI account. Never prefix the key with `NEXT_PUBLIC_` or commit `.env`.

Generation is explicit and only offered for unknown dishes. Existing matches return without calling OpenAI. The model interprets the requested dish/language and drafts the recipe; deterministic TypeScript remains the authority for rules and quantities. Ingredient names/IDs are requested in English for normalization; descriptions and instructions use the selected language.

The request includes rule values and pantry ingredients, not household/member names, relationships or freeform fasting notes. OpenAI requests use `store:false`, a 45-second timeout, zero automatic retries and a 6,000-output-token cap. Failure or a missing key returns a clear error while local operations continue.

Drafts live only in process memory for 30 minutes, never in recipe tables before confirmation. Identical in-flight requests are coalesced; successful drafts are cached against request, model and household version. At most two generations run concurrently and thirty drafts are retained. Drafts disappear on restart. The UI can discard them immediately.

Explicit save rechecks current participants/rules, avoids duplicate requested/generated names, creates normalized ingredient records as needed, and records model, request identity and generation/save timestamps. In this conservative implementation, drafts with unresolved quantities/compositions, hard violations, unknown rules or time warnings cannot be saved. They must be discarded and regenerated or the underlying household configuration corrected. There is no arbitrary browser-supplied recipe-save shortcut.

## Migration and persistence

`prisma/migrations/20261016065010_phase2_planning/migration.sql` adds:

- `HouseholdMember.allowEggs` with a false default;
- optional fasting start/end dates and meal scope;
- `MealPlanDish` with servings, member assignments and recipe snapshots;
- meal type, servings, limit, creation time and decision snapshot on `MealPlan`;
- `RecipeGenerationRecord` with household scope, unique request identity and provenance.

Existing rows are copied during SQLite table redefinition, preserving IDs and relationships. Plan snapshots retain the selected recipe, quantities, ingredient checks, member rules, explanation, score and input state version. Saving re-evaluates on the server and rejects a stale household version with HTTP 409. Shopping/confirmation plans require explicit acknowledgement; hard-rejected plans cannot be saved. Reopening labels the stored snapshot and detects later household changes. Another save is a new plan record; the dashboard shows the latest per meal type/date.

## API additions

All use the existing `{data,error}` envelope and strict Zod validation. No caller-supplied household ID is accepted.

| Endpoint                                   | Input / result                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/recipes/resolve?name=...`        | Matching preferred recipe, source explanation and generation option                                                                                            |
| `POST /api/recipes/generate`               | `dishName`, `memberIds`, `date`, `mealType`, `servings`, `maxMinutes`; optional `cuisine`, `preferredLanguage`; returns unsaved draft/token or existing recipe |
| `POST /api/recipes/generated/save`         | `{token, confirmed:true}`; saves reviewed draft                                                                                                                |
| `POST /api/recipes/generated/discard`      | `{token}`; discards draft                                                                                                                                      |
| `POST /api/recipes/reset/[customRecipeId]` | `{confirmed:true}`; prefers original, retains custom copy                                                                                                      |
| `POST /api/recipes/scale`                  | `{recipeId, servings}`                                                                                                                                         |
| `POST /api/recipes/verify`                 | `{recipeId, memberIds, date, mealType}`                                                                                                                        |
| `POST /api/meals/recommend`                | `{memberIds,date,mealType,servings,maxMinutes,requestedDish?}`                                                                                                 |
| `POST /api/meals`                          | `{request,dishes,stateVersion,acknowledgeUncertainty}`; each dish contains `recipeId`, `servings`, `memberIds`                                                 |
| `GET /api/meals?date=YYYY-MM-DD`           | Saved plans, newest first, up to 50                                                                                                                            |
| `GET /api/meals/[id]`                      | Plan, immutable decision snapshot and state-change indicator                                                                                                   |
| `POST /api/ingredients/check`              | `{date,dishes}`; combined requirements, stock and shortages                                                                                                    |
| `POST /api/groceries/calculate`            | Same input and shared calculation service; consolidated groceries plus unknown-stock confirmations                                                             |

## Verification and remaining limits

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:http
```

Tests migrate/seed disposable databases, preserving `prisma/dev.db`. The HTTP smoke script launches the production build on loopback port 3102 with an isolated database and stops it afterward. It tests real same-origin requests, all screens, resolution, scaling, dietary rejection, recommendations, checklists, plan save/reopen, stale-version rejection, missing-key fallback and inventory preservation.

The suite covers Phase 1 regressions plus hard dietary profiles, allergy precedence, fasting windows/whitelists, unknown composition/rules, precise scaling, conversion, aggregation, stock uncertainty, deterministic shared/two-dish planning, custom precedence/reset, draft caching/confirmation/discard, invalid AI output, provenance, SDK structured-output request parsing and refusals. SDK tests mock HTTP; no paid generation is required.

No live OpenAI call was verified because no API key is configured. Browser visual/mobile interaction QA remains unverified because this session has no available browser surface. This is still an unauthenticated, loopback-only, single-household demo. There is no voice capture, YouTube integration, shopping/payment integration, automatic replanning, cooking-completion event or inventory deduction.

## Phase 3 handoff

Reuse `recommendMenus(request, planningData)` as the deterministic planner; do not create a separate AI planner. Watch existing transactional activity/state versions, read one consistent data snapshot, and recheck the version before saving a revised plan. Introduce explicit plan supersession/idempotency and approval behavior before automatic replanning. Preserve the immutable historical snapshots.

Voice should produce validated candidate mutations that reuse the existing services, with explicit confirmation where needed. Cooking completion must be a separate idempotent transaction that checks stock/version and records deductions; it must never be implied by plan selection. Extend ingredient composition/allergen knowledge with reviewed provenance before allowing compound ingredients to become verified. If adding prices or feedback, replace neutral score components with stored evidence and version the scoring policy.

Verification result: 45 automated tests and 22 live HTTP checks passed, alongside TypeScript checking and the production build.
