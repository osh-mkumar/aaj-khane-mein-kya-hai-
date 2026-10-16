# RasoiOS — End-to-End Kitchen Intelligence System
**The Voice-First, Self-Correcting Household Kitchen Operating System.** Built for Renaissance 2026.

RasoiOS answers the daily question:
> **"What should our household cook today, given who is eating, what is available, dietary restrictions, time, and changing circumstances?"**

Unlike a recipe chatbot, RasoiOS maintains persistent household state, understands Hindi/English/Hinglish kitchen speech, requests explicit user confirmation for proposed changes, commits atomic state updates, and **automatically replans affected meals when kitchen reality changes**.

---

## 🌟 Key Capabilities

1. **Voice-First Input with Groq Whisper & WebSpeech**:
   - High-accuracy speech-to-text using Groq `whisper-large-v3-turbo`.
   - Browser WebSpeech API fallback + manual typing fallback.
   - Code-mixed Hindi, English, and Hinglish understanding without forced restrictive language parameters.
2. **Resilient AI Command Interpretation**:
   - Primary: Gemini `gemini-3.1-flash-lite` server-side extraction.
   - Secondary: Groq `openai/gpt-oss-20b` automatic fallback on Gemini rate limits, 503 overloads, or service disruptions.
   - Strict Zod schema validation over all AI outputs; LLMs never write directly to the database.
   - Distinguishes between available stock (*"palak aadha kilo bacha hai"*) and requirements/wishes (*"palak chahiye"*).
3. **Transparent Human Confirmation**:
   - Plain-language preview of interpreted kitchen actions before any mutation.
   - Edit, discard, or confirm individual proposals with idempotent transaction tokens (`idempotencyKey`).
4. **Self-Correcting Meal Replanning**:
   - Confirmed changes (e.g., *"Paneer khatam ho gaya"*) atomically update inventory availability and recalculate affected meals.
   - Deterministic TypeScript meal solver detects now-infeasible dishes, marks old plans stale/rejected, and finds viable alternatives with explanations.
5. **Cook Mode with Multilingual TTS**:
   - Hands-free cooking view with step-by-step navigation, dynamic serving scaling, and ingredient checklists.
   - Browser `SpeechSynthesis` read-aloud support for Hindi, English, and Marathi.
   - Direct supplementary YouTube recipe search query generator without requiring YouTube API keys or web scraping.
6. **Grocery Gap Aggregator**:
   - Compares planned meal requirements against current stock to highlight missing ingredients, shortfalls, and affected recipes.

---

## 🚀 Quickstart & Setup

### Prerequisites
- Node.js 22.12+ (Node 24 LTS recommended)
- npm

### 1. Clone & Install
```bash
git checkout feature/phase3-ai-integration
npm install
```

### 2. Configure Environment Variables
Copy or configure `.env.local` with your API keys:
```env
DATABASE_URL="file:./prisma/dev.db"
GEMINI_API_KEY="your-gemini-api-key"
GROQ_API_KEY="your-groq-api-key"
```
*(Note: Both AI providers run strictly server-side. No API keys are bundled to client-side code).*

### 3. Setup Database & Seed
```powershell
npm run db:setup
```
This runs SQLite migrations and seeds the database with a realistic multi-generational Indian household (including vegetarian, Jain, and fasting members), canonical ingredients, and 15 authentic recipes.

### 4. Run the Application
```powershell
npm run dev
```
Open **http://127.0.0.1:3000** in your browser.

---

## 🧪 Automated Verification & Tests

To execute the test suite (58 tests covering Phase 1, Phase 2, Phase 3 voice validation, mutations, and replanning):
```powershell
npm test
```

To run TypeScript compiler verification:
```powershell
npx tsc --noEmit
```

To run Next.js production build:
```powershell
npm run build
```

---

## 🎙️ The 6 End-to-End Demo Scenarios

### Scenario A — Initial Meal Planning
1. Navigate to **Meal Planner** (`/meal-planner`).
2. Select lunch for all participating household members.
3. Click **Find Menus**.
4. The deterministic solver evaluates inventory, fasting status, cooking time, and dietary constraints, outputting recommended menus with complete constraint explanations.

### Scenario B — Ingredient Becomes Unavailable & Auto-Replanning
1. Navigate to **Voice Assistant** (`/voice`).
2. Speak or type: `"Paneer khatam ho gaya."`
3. Click **Interpret Kitchen Voice**.
4. Review the interpreted proposal: `Mark paneer as UNAVAILABLE`.
5. Click **Confirm & Apply to Kitchen**.
6. RasoiOS updates inventory to `UNAVAILABLE`, detects that today's lunch (e.g. *Palak Paneer*) is no longer feasible, rejects the old plan, searches for a viable alternative (e.g. *Aloo Palak* or *Dal Tadka*), and refreshes cooking instructions.

### Scenario C — Quantity Update with Unit Conversion
1. In the Voice Assistant, speak or type: `"Palak aadha kilo bacha hai."`
2. Interpret: Proposals show `Set spinach quantity to 500 g`.
3. Confirm: The database updates the stock. View the update in **Kitchen Inventory** (`/inventory`).

### Scenario D — Fasting Status Adaptation
1. In the Voice Assistant, speak or type: `"Aaj dadi ka vrat hai."`
2. Interpret: Maps `"dadi"` to member *Sushila* and sets fasting active.
3. Confirm: Sushila's fasting rules are activated. Any planned meals are checked against fasting constraints, ensuring grains/onions/garlic are excluded for her.

### Scenario E — Provider Fallback Simulation
1. If Gemini encounters rate limiting or 503 overload, the system seamlessly falls back to Groq `openai/gpt-oss-20b`.
2. The user experience remains uninterrupted, and the provider metadata reflects which engine served the request.

### Scenario F — Voice Fallback to Typing
1. If microphone permission is denied or the user is in a noisy environment, use the manual text entry field.
2. The exact same interpretation, validation, confirmation, and replanning pipeline executes.

---

## 👥 Dual Dashboard Architecture

RasoiOS provides two dedicated operational interfaces sharing the **exact same SQLite database and live state**:

```
+-------------------------------------------------------------+
|                 Top Navigation: [ Family | Cook ]           |
+------------------------------+------------------------------+
|       Family Dashboard       |        Cook Dashboard        |
|           (/family)          |            (/cook)           |
+------------------------------+------------------------------+
| • Who is eating today?       | • What am I cooking right now?|
| • Dietary & fasting rules    | • Serving count & time       |
| • Deterministic meal planner | • Dietary preparation alerts |
| • Pantry stock & editing     | • Interactive ingredients tap|
| • Grocery gap aggregator     | • Step-by-step cooking guide |
| • Household activity history | • Browser TTS (Hindi/En/Mr)  |
| • Voice Assistant interface  | • Quick voice reporting      |
|                              | • 1-tap "Ingredient missing" |
|                              | • Real-time auto-replanning  |
+------------------------------+------------------------------+
|                     Shared SQLite Database                  |
|  (Household • Members • Inventory • MealPlans • Activity)   |
+-------------------------------------------------------------+
```

### 1. Instant Role Switcher
- Visible toggle in the application header: **Family | Cook**.
- Zero login, password, OTP, or verification needed.
- Demo-mode role switcher persisted across browser sessions via `localStorage.getItem("rasoios_active_role")`.
- Default to **Family Dashboard** for first-time visitors.

### 2. Family Dashboard (`/family`)
- High-density planning console.
- Today's breakfast, lunch, and dinner cards.
- Member management with vegetarian, vegan, Jain, allergy, dislike, and fasting preferences.
- Phase 2 deterministic constraint solver recommendations with reasons and alternatives.
- Consolidated grocery shortages and kitchen audit history.

### 3. Cook Dashboard (`/cook`)
- Task-focused, accessible, touch-friendly interface designed for tablet/mobile kitchen counters:
  - **"What am I cooking?"**: Active dish title, meal type, number of servings, estimated cooking time.
  - **Dietary Notices**: Prominent warning banners (e.g. *"Dadi (Sushila) has an active Fast today. Prepare separate dishes without onion, garlic, or grains"*).
  - **Ingredients Checklist**: Tap-to-check ingredients with required vs. available quantities.
  - **Step-by-Step Cooking**: High-contrast, one-step-at-a-time instructions with Next/Previous navigation, browser speech synthesis read-aloud (Hindi, English, Marathi), and direct YouTube search links.
  - **Report Kitchen Changes**: Voice microphone button + manual text input for quick updates (*"Paneer khatam ho gaya"*, *"Palak aadha kilo bacha hai"*).
  - **Quick Missing Ingredient Action**: One-tap "Report Missing" button with immediate stock invalidation, deterministic meal revalidation, and alternate recipe replacement.
  - **Cooking Progress**: Track meal status (`NOT_STARTED` -> `IN_PROGRESS` -> `COMPLETED`) with localStorage persistence.

---

## 📚 Mendeley Indian Recipe Dataset Integration

RasoiOS integrates the real-world **Mendeley Indian Recipe Dataset** from Archana's Kitchen to power its regional Indian recipe library alongside manually curated household dishes.

- **Source**: [Mendeley Data xsphgmmh7b.1](https://data.mendeley.com/datasets/xsphgmmh7b/1/files/6fb5ae32-a815-4b8f-9d68-8d512227eac8)
- **Author**: Kanishka Jain
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)
- **File Name**: `IndianFoodDatasetCSV.csv` (24.15 MB, 6,871 recipe records)
- **Discovered Columns (15)**:
  `Srno`, `RecipeName`, `TranslatedRecipeName`, `Ingredients`, `TranslatedIngredients`, `PrepTimeInMins`, `CookTimeInMins`, `TotalTimeInMins`, `Servings`, `Cuisine`, `Course`, `Diet`, `Instructions`, `TranslatedInstructions`, `URL`.

### Ingestion & Normalization Rules
1. **Multiline Quoted CSV Parser**: Custom state-machine parser handling commas, quotes, and multiline text inside recipe descriptions.
2. **Deterministic Quantity & Unit Parsing**: Parses compound fractions (`2-1/2` -> `2.5`, `1/2` -> `0.5`, `3/4` -> `0.75`), decimal numbers, and converts raw text units into canonical RasoiOS units (`tbsp`, `tsp`, `cup`, `g`, `kg`, `clove`, `pinch`).
3. **No Hallucinated Quantities**: Recipes without explicit ingredient quantities preserve original text but mark quantities as `UNKNOWN` rather than inventing quantities.
4. **Solver Protection Rule**: Recipes marked incomplete (`isComplete: false` or missing critical cooking metadata) are flagged as **"Inspiration Only"** in the recipe catalog and are **strictly excluded** from deterministic feasibility calculation and meal planning solver candidates.
5. **Attribution**: Every imported recipe carries dataset attribution in `dietaryMetadata.attribution`.
6. **Curated Recipe Preservation**: Existing 15 local curated recipes (`source: "LOCAL"`) remain untouched.

### Running Dataset Ingestion
To run the reproducible importer:
```powershell
npm run db:import-mendeley
```

---

## 📡 API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/voice/transcribe` | `POST` | Groq Whisper speech-to-text with code-mixed support |
| `/api/voice/interpret` | `POST` | Gemini -> Groq command interpreter with Zod validation |
| `/api/voice/confirm` | `POST` | Atomic mutation executor with idempotency & auto-replanning |
| `/api/groceries/gaps` | `GET` | Aggregated shortages for upcoming scheduled meals |
| `/api/household` | `GET` | Household profiles, members, and inventory state |
| `/api/recipes` | `GET` | Recipe catalog with ingredients and steps |
| `/api/meals/recommend` | `POST` | Deterministic meal solver recommendations |
| `/api/meals` | `GET, POST` | Retrieve or persist approved meal plans |
| `/api/activity` | `GET` | Audit log with timestamps and state versions |

---

## 🔒 Security & Reliability Guarantees
- **No Direct LLM Writes**: All AI interpretations are validated against strict Zod schemas before being shown to the user.
- **Human-in-the-Loop Confirmation**: No inventory or member state changes occur without explicit user review.
- **Idempotent Mutations**: Batches use an `idempotencyKey` preventing double submissions or race conditions.
- **Zero Hallucinated Recipes**: Recommendations are strictly resolved from verified household recipe templates and real pantry stock.
- **Incomplete Dataset Protection**: Incomplete recipes are strictly flagged and barred from meal solver candidates.
- **No Leaked Secrets**: All API keys remain server-side.

