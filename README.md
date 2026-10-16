# RasoiOS — The Voice-First, Self-Correcting Household Kitchen Operating System

> **"What should our household cook today, given who is eating, what is available in the pantry, dietary restrictions, available time, and fast-changing circumstances?"**

RasoiOS is an end-to-end, deterministic kitchen intelligence system designed for real Indian households. Unlike generic recipe chatbots, RasoiOS maintains persistent household state, understands code-mixed Hindi/English/Hinglish kitchen speech, requires human-in-the-loop confirmation before modifying inventory, and **automatically replans affected meals when kitchen reality changes**.

---

## 🌟 Key Innovations & Capabilities

### 1. Dual Dashboard Architecture (`/family` & `/cook`)
- **Instant Demo-Mode Role Switcher**: A single toggle in the navigation header (**Family | Cook**) lets users switch perspectives instantly without passwords, OTPs, or authentication.
- **Family Dashboard (`/family`)**: The planning command center. Manage multi-generational household members, dietary preferences, Jain/fasting rules, allergies, pantry inventory, deterministic meal planning, and grocery shortages.
- **Cook Dashboard (`/cook`)**: Task-focused and touch-friendly for tablets and mobile kitchen counters. Answers *"What am I cooking? What ingredients? What next? What if something is missing?"* Features large text, tap-to-check ingredients checklist, one-step-at-a-time instructions, browser Text-to-Speech (Hindi, English, Marathi), 1-tap "Report Missing Ingredient" actions, and live auto-replanning.
- **Shared Live State**: Both dashboards read from and write to the same SQLite database. Any update reported by the cook immediately updates the family meal plan and vice-versa.

### 2. Mendeley Indian Recipe Dataset Integration
- Integrates the 24 MB real-world **Mendeley Indian Recipe Dataset** (6,871 recipes from Archana's Kitchen, CC BY 4.0 by Kanishka Jain) alongside authentic household dishes.
- **Reproducible Ingestion Pipeline**: State-machine CSV parser, compound fraction normalizer (`2-1/2` → `2.5`), unit standardizer, and ingredient deduplicator.
- **Solver Protection Rule**: Recipes missing crucial metadata or cooking times are marked as *Inspiration Only* and are strictly excluded from deterministic feasibility calculations, ensuring no user is recommended an uncookable meal.

### 3. Voice-First Multilingual Speech & Interpretation
- **Groq Whisper Large-v3-Turbo**: High-accuracy speech-to-text supporting code-mixed Hindi, English, and Hinglish.
- **Browser WebSpeech & Text Fallback**: Graceful fallback when microphone permissions are denied or when typing is preferred.
- **Resilient AI Pipeline**: Server-side command interpretation via **Gemini 3.1 Flash Lite**, with automatic fallback to **Groq `openai/gpt-oss-20b`** on rate limits (HTTP 429), server overloads (HTTP 503), or service outages.

### 4. Human-in-the-Loop Confirmation & Self-Correction
- **No Direct LLM Writes**: AI models never modify the database directly. Proposed actions are parsed into strict Zod schemas and presented in a transparent preview modal.
- **Idempotent Mutations**: Batches use an `idempotencyKey` preventing race conditions or double updates.
- **Automated Self-Correcting Replanning**: When an ingredient is marked unavailable (*"Paneer khatam ho gaya"*), RasoiOS invalidates the scheduled meal, activates the deterministic solver, and recommends feasible alternatives.

---

## 🏗️ System Architecture

```
+---------------------------------------------------------------------------------------+
|                                    RasoiOS Header                                     |
|                       [ Role Switcher:  Family  |  Cook ]                             |
+-------------------------------------------+-------------------------------------------+
|             Family Dashboard              |              Cook Dashboard               |
|                 (/family)                 |                  (/cook)                  |
|  • Today's Meals & Dietary Notices        |  • Today's Meal & Servings Card           |
|  • Household Profiles & Fasting Toggles   |  • Dietary Preparation Warnings           |
|  • Deterministic Meal Solver              |  • Tap-to-Check Ingredients Checklist     |
|  • Pantry Inventory & Editing             |  • Step-by-Step Cooking + Web TTS         |
|  • Grocery Gap Shortage Aggregator        |  • Voice Reporting + 1-Tap Missing Alerts |
|  • State Audit Activity Log               |  • Cooking Progress Tracker               |
+-------------------------------------------+-------------------------------------------+
                     │                                            │
                     ▼                                            ▼
+---------------------------------------------------------------------------------------+
|                                  API & Service Layer                                  |
|  • /api/voice/transcribe (Groq Whisper Large-v3-Turbo)                                |
|  • /api/voice/interpret  (Gemini 3.1 Flash Lite -> Groq GPT-OSS-20B Fallback)         |
|  • /api/voice/confirm    (Atomic Transaction Mutations + Automatic Replanning)        |
|  • /api/meals/recommend  (Phase 2 Deterministic TypeScript Constraint Solver)         |
|  • /api/groceries/gaps   (Inventory vs. Planned Meals Shortfall Aggregator)           |
+---------------------------------------------------------------------------------------+
                                            │
                                            ▼
+---------------------------------------------------------------------------------------+
|                         Shared SQLite Database (Prisma ORM)                           |
|      Household  •  Members  •  Inventory  •  Recipes  •  MealPlans  •  ActivityLogs     |
+---------------------------------------------------------------------------------------+
```

---

## 🚀 Quickstart & Installation

### Prerequisites
- **Node.js**: v22.12.0 or later (Node 24 LTS recommended)
- **npm**: v10+
- **Git**

### 1. Clone & Checkout Branch
```bash
git clone https://github.com/Sodhani0007/aaj-kya-hai-khane-mein.git
cd aaj-kya-hai-khane-mein
git checkout feature/phase3-ai-integration
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create or verify `.env.local` in the project root:
```env
DATABASE_URL="file:./prisma/dev.db"
GEMINI_API_KEY="your-gemini-api-key"
GROQ_API_KEY="your-groq-api-key"
```
*(Note: All AI credentials operate strictly server-side. No API keys are bundled into client code).*

### 4. Database Setup & Seeding
```powershell
npm run db:setup
```
This runs Prisma migrations, creates SQLite tables, seeds the realistic Mehta household (with Jain, vegetarian, and fasting members), loads 15 curated recipes, and imports regional dishes from the Mendeley dataset.

*(Optional standalone dataset import)*:
```powershell
npm run db:import-mendeley
```

### 5. Start the Development Server
```powershell
npm run dev
```
Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)** in your browser.

---

## 👥 Dual Dashboard Navigation

| Perspective | Route | Key Purpose | Primary Actions |
| :--- | :--- | :--- | :--- |
| **Family Dashboard** | `/family` | Household planning and constraints | Plan meals, manage members, set fasting rules, review grocery gaps |
| **Cook Dashboard** | `/cook` | Kitchen execution and preparation | View active dish, check ingredients, read aloud steps, report shortages |

- Switch between dashboards anytime via the topbar toggle.
- Preferences are saved in `localStorage.rasoios_active_role` across refreshes.

---

## 📚 Mendeley Indian Recipe Dataset Integration

- **Dataset Source**: [Mendeley Data xsphgmmh7b.1](https://data.mendeley.com/datasets/xsphgmmh7b/1/files/6fb5ae32-a815-4b8f-9d68-8d512227eac8)
- **Author**: Kanishka Jain (Archana's Kitchen collection)
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)
- **File**: `IndianFoodDatasetCSV.csv` (24.15 MB, 6,871 records)
- **15 Columns Discovered & Parsed**:
  `Srno`, `RecipeName`, `TranslatedRecipeName`, `Ingredients`, `TranslatedIngredients`, `PrepTimeInMins`, `CookTimeInMins`, `TotalTimeInMins`, `Servings`, `Cuisine`, `Course`, `Diet`, `Instructions`, `TranslatedInstructions`, `URL`.

### Ingestion Metrics
- **Total Records in File**: 6,871
- **Complete & Verified Candidates**: 6,507
- **Incomplete / Inspiration Only**: 364
- **Seeded Set**: 100 regionally balanced dishes (North Indian, South Indian, Maharashtrian, Gujarati, Bengali) + curated household originals.
- **Incomplete Recipe Protection**: Recipes flagged `isComplete: false` are visible in the recipe catalog for inspiration, but **strictly barred** from deterministic feasibility calculation and meal planning solver candidates (`INCOMPLETE_DATASET_RECIPE` rule violation).

---

## 🎙️ The 6 End-to-End Demo Scenarios

### Scenario A — Initial Family Meal Planning
1. Open **Family Dashboard** (`/family` or `/meal-planner`).
2. Select **Lunch**, set cooking time to **45 minutes**, and choose participating household members.
3. Click **Find Menus**.
4. The deterministic solver evaluates inventory, fasting rules, and preparation time, recommending valid menus with detailed constraint explanations.

### Scenario B — Cook Reports Missing Ingredient & Automatic Replanning
1. Family schedules *Palak Paneer* for lunch.
2. Cook opens **Cook Dashboard** (`/cook`) and sees *Palak Paneer* with required ingredients and steps.
3. Cook clicks the microphone or taps: `"Paneer khatam ho gaya."`
4. Review the interpreted proposal: `Mark paneer as UNAVAILABLE`.
5. Cook confirms:
   - `paneer` stock is set to `UNAVAILABLE` in the shared SQLite database.
   - The active lunch plan with *Palak Paneer* is invalidated (`REJECTED`).
   - The solver automatically re-evaluates pantry stock and recommends a feasible replacement (e.g. *Dal Tadka* or *Aloo Palak*).
   - Both Cook and Family dashboards immediately reflect the updated menu.

### Scenario C — Stock Quantity Update with Unit Normalization
1. Cook or family speaks: `"Palak aadha kilo bacha hai."`
2. AI interpreter normalizes `"aadha kilo"` to `500 g` and maps `"palak"` to canonical `spinach`.
3. Confirming the proposal updates the inventory stock and recalculates grocery gap requirements.

### Scenario D — Dynamic Fasting Status Adaptation
1. Speak or type: `"Aaj dadi ka vrat hai."`
2. Interpreter identifies `"dadi"` as member *Sushila* and toggles her temporary fasting rule to `active`.
3. Confirmed action immediately enforces fasting restrictions: all dishes prepared for Sushila exclude grains, onions, and garlic, allowing only approved fasting ingredients (e.g., *sabudana*, *potato*, *rock salt*).

### Scenario E — Resilient AI Provider Fallback
1. If Gemini encounters rate limits (HTTP 429) or service outages (HTTP 503), RasoiOS automatically routes the request to Groq `openai/gpt-oss-20b`.
2. The user experience remains uninterrupted, and the response metadata indicates the active provider and fallback status.

### Scenario F — Voice Fallback to Text Entry
1. If microphone access is denied or ambient kitchen noise is high, the cook or family user can type directly into the input field.
2. The exact same interpretation, validation, confirmation, and auto-replanning pipeline executes.

---

## 🧪 Automated Testing & Verification

RasoiOS includes an exhaustive test suite covering all four phases of development:

```powershell
# Run all Vitest suites (66/66 tests passing)
npm test

# Run TypeScript compiler verification (0 errors)
npm run typecheck

# Run Next.js production build
npm run build
```

### Test Suite Breakdown
| Test Suite | File | Tests | Coverage |
| :--- | :--- | :---: | :--- |
| **Phase 1** | `tests/phase1.test.ts` | 13 | Household lifecycle, members, dietary rules, inventory CRUD, and unit conversions |
| **Phase 2** | `tests/phase2.test.ts` | 32 | Scaling, dietary verifier, deterministic solver, grocery gap aggregation |
| **Phase 3 Voice** | `tests/phase3_voice.test.ts` | 9 | Zod schemas, proposed actions, interpretation payloads |
| **Phase 3 Mutations**| `tests/phase3_mutations.test.ts`| 4 | Atomic database mutations, idempotency tokens, replan triggering |
| **Phase 4 Integration**| `tests/phase4_dual_dashboard_mendeley.test.ts` | 8 | Mendeley CSV parser, unit parsing, solver exclusion, shared dual-dashboard state |
| **Total** | | **66** | **100% Passing** |

---

## 📡 API Reference

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/voice/transcribe` | `POST` | Groq Whisper speech-to-text with code-mixed audio support |
| `/api/voice/interpret` | `POST` | Gemini → Groq command interpreter with strict Zod validation |
| `/api/voice/confirm` | `POST` | Atomic mutation executor with idempotency & auto-replanning |
| `/api/groceries/gaps` | `GET` | Aggregated shortages for upcoming scheduled meals |
| `/api/household` | `GET, PATCH` | Household profiles, members, and inventory state |
| `/api/recipes` | `GET, POST` | Recipe catalog with ingredients, steps, and verification badges |
| `/api/meals/recommend` | `POST` | Phase 2 deterministic constraint solver recommendations |
| `/api/meals` | `GET, POST` | Retrieve or persist approved meal plans |
| `/api/activity` | `GET` | Audit log with timestamps, sources, and state versions |

---

## 🔒 Security & Reliability Guarantees

1. **No Direct LLM Database Writes**: Large language models never write directly to the database. All interpretations are parsed into validated schema objects for user approval.
2. **Deterministic Feasibility**: Inventory feasibility and dietary constraints are calculated mathematically in TypeScript, never guessed by an LLM.
3. **Idempotent Mutations**: Every confirmation payload requires an `idempotencyKey` preventing duplicate execution or race conditions.
4. **Server-Side Credentials**: Gemini and Groq API keys remain strictly server-side.
5. **Incomplete Dataset Protection**: Incomplete recipes are strictly flagged and cannot be marked feasible by the solver.

---

## 📄 License & Attribution

- **Application Code**: MIT License. Built for Renaissance 2026.
- **Recipe Dataset**: [Mendeley Data](https://data.mendeley.com/datasets/xsphgmmh7b/1/files/6fb5ae32-a815-4b8f-9d68-8d512227eac8), Author: Kanishka Jain, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
