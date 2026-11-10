# WealthGenie — Phase 0: Clean Architecture & Data Integrity Walkthrough

We have completed the restructuring of the repository into a clean, maintainable monorepo architecture tailored for Indian personal finance beginners, enforcing strict data integrity, INR formatting, honest AI states, and verifiable calculation logic.

---

## 1. Final Folder Tree

```
wealthgenie/
├── frontend/                     # React 18, Vite, Tailwind CSS UI
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js            # Reverse proxy for /api -> http://localhost:5001
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── src/
│       ├── index.css
│       ├── main.jsx
│       ├── App.jsx
│       ├── data/
│       │   └── mockData.js       # Indian context, ₹ balances, SIP lessons
│       ├── utils/
│       │   └── formatters.js     # en-IN currency and number formatters
│       ├── components/
│       │   ├── common/           # Card, Badge, ProgressBar, Modal
│       │   ├── layout/           # Sidebar, TopNav, DisclaimerBanner
│       │   └── dashboard/        # FinancialSummary, GoalProgress, AskGenieBanner, etc.
│       └── pages/                # Home, Learn, AskGenie, MyFinances, ExploreInvestments, Goals
├── backend/                      # Node.js + Express REST API
│   ├── package.json
│   └── src/
│       ├── app.js                # Express application factory & middleware
│       ├── server.js             # HTTP listener (port 5001)
│       ├── config/
│       │   └── env.js            # Environment validation
│       ├── routes/
│       │   ├── health.routes.js  # GET /api/health
│       │   ├── ai.routes.js      # POST /api/ai/chat, GET /api/ai/status
│       │   ├── calc.routes.js    # POST /api/calculate/sip, /compound
│       │   └── invest.routes.js  # GET /api/investments/sources, /historical
│       ├── services/
│       │   └── ai.service.js     # LLM provider interface & safety error handler
│       └── utils/
│           └── financialMath.js  # Tested SIP & compound interest calculations
├── ai/                           # AI prompts, safety rules, and RAG schemas
│   ├── prompts/
│   │   └── tutorPrompt.js        # Persona & Indian personal finance instructions
│   ├── safety/
│   │   └── guardrails.json       # Non-advisory rules & safety triggers
│   └── README.md                 # AI architecture and RAG plans
├── data/                         # Datasets & provenance standards
│   ├── raw/                      # Candidate raw datasets (.gitkeep)
│   ├── processed/                # Normalized datasets (.gitkeep)
│   ├── sources/
│   │   └── sources.json          # Metadata registry for Nifty, AMFI, SEBI, RBI
│   └── README.md                 # Acquisition instructions and provenance rules
├── docs/                         # Engineering & domain documentation
│   ├── ARCHITECTURE.md           # System boundaries & component design
│   ├── API_CONTRACTS.md          # REST API specifications and response schemas
│   └── INDIAN_FINANCIAL_CONTEXT.md # Indian instruments, tax rules, and safety
├── tests/                        # Automated unit & integration tests
│   ├── calculations.test.js      # Unit tests for SIP math, compounding & formatINR
│   └── api.test.js               # Integration tests for health, calculations & AI errors
├── .env.example                  # Safe placeholder variables
├── .gitignore                    # Standard Node & React ignore rules
├── package.json                  # Root monorepo orchestration
└── README.md                     # Setup, testing, and execution guide
```

---

## 2. Inventory of File Changes

### Files Moved:
- Root React app moved into `frontend/`:
  - `src/` -> `frontend/src/`
  - `index.html` -> `frontend/index.html`
  - `vite.config.js` -> `frontend/vite.config.js`
  - `tailwind.config.js` -> `frontend/tailwind.config.js`
  - `postcss.config.js` -> `frontend/postcss.config.js`
  - `package.json` -> `frontend/package.json`
  - `package-lock.json` -> `frontend/package-lock.json`
  - `node_modules/` -> `frontend/node_modules/`

### Files Added:
- **Root**: `package.json` (monorepo scripts), `.env.example`, `.gitignore`, `README.md`.
- **Backend**: `backend/package.json`, `backend/src/app.js`, `backend/src/server.js`, `backend/src/config/env.js`, `backend/src/services/ai.service.js`, `backend/src/utils/financialMath.js`, `backend/src/routes/health.routes.js`, `backend/src/routes/ai.routes.js`, `backend/src/routes/calc.routes.js`, `backend/src/routes/invest.routes.js`.
- **AI**: `ai/prompts/tutorPrompt.js`, `ai/safety/guardrails.json`, `ai/README.md`.
- **Data**: `data/sources/sources.json`, `data/README.md`, `data/raw/.gitkeep`, `data/processed/.gitkeep`.
- **Docs**: `docs/ARCHITECTURE.md`, `docs/API_CONTRACTS.md`, `docs/INDIAN_FINANCIAL_CONTEXT.md`.
- **Tests**: `tests/calculations.test.js`, `tests/api.test.js`.
- **Frontend Utilities**: `frontend/src/utils/formatters.js`.

### Files Modified:
- `frontend/src/data/mockData.js`: Converted all mock metrics from USD to INR (`₹`), updated user profile to Indian resident ("Aarav Sharma", Bengaluru), replaced US accounts with SBI Savings, HDFC Sweep-in FD, UTI Nifty 50 Index SIP.
- `frontend/src/components/dashboard/FinancialSummary.jsx`: Formatted with `formatINR`.
- `frontend/src/components/dashboard/GoalProgressCard.jsx`: Formatted with `formatINR`.
- `frontend/src/components/dashboard/AskGenieBanner.jsx`: Added Indian prompt chips and backend connectivity notice.
- `frontend/src/components/dashboard/InvestmentBasics.jsx`: Updated to Indian asset classes and regulatory notes.
- `frontend/src/components/layout/DisclaimerBanner.jsx`: Updated to Indian regulatory notice.
- `frontend/src/components/layout/Sidebar.jsx` & `TopNav.jsx`: Updated texts and badges to reflect Phase 0 India Context.
- `frontend/src/pages/HomePage.jsx`: Date formatted to `en-IN`.
- `frontend/src/pages/LearnPage.jsx`: Added Indian curriculum categories (Investing Basics, Budgeting, Cash Management, Tax & Retirement, Financial Safety).
- `frontend/src/pages/AskGeniePage.jsx`: Completely removed fake client keyword generator; connected to `/api/ai/chat` with honest unconfigured setup state.
- `frontend/src/pages/MyFinancesPage.jsx`: Migrated accounts, expenses, and ledger to Indian instruments with `formatINR`.
- `frontend/src/pages/ExploreInvestmentsPage.jsx`: Replaced fake APYs with a deterministic SIP calculator and honest empty state for historical index data.
- `frontend/src/pages/GoalsPage.jsx`: Migrated goals to INR.
- `frontend/src/App.jsx`: Updated footer disclaimers.
- `frontend/vite.config.js`: Added reverse proxy for `/api` to port 5001.

### Files Removed:
- Client-side keyword-based answer generator in `AskGeniePage.jsx`.
- Build artifacts in `dist/` and `.vite/`.

---

## 3. Existing Mock Data Status & Rationale

| Dataset / Mock Item | Location | Retained? | Rationale |
| :--- | :--- | :--- | :--- |
| User Profile & Banking Snapshot | `frontend/src/data/mockData.js` | **Yes (Illustrative UI)** | Retained strictly as an educational scenario for an Indian beginner (Aarav Sharma, Bengaluru). Allows evaluation of dashboard states without requiring real bank connections or backend databases in Phase 0. Toggleable to zero-data empty state. |
| Curriculum Lessons | `frontend/src/data/mockData.js` | **Yes (Educational Content)** | High-quality, verified educational summaries of foundational concepts (SIPs, Emergency Funds, 50/30/20 in Indian cities, PPF vs EPF, UPI safety). |
| Keyword-matching Fake AI Answers | `frontend/src/pages/AskGeniePage.jsx` | **No (Removed)** | Replaced with live backend integration and an honest unconfigured setup notice when `GEMINI_API_KEY` is not present. |
| Fabricated Investment Return % | `frontend/src/data/mockData.js` | **No (Removed)** | Removed arbitrary return figures. Replaced with regulatory descriptions (RBI / SEBI) and an honest empty state for historical data. |

---

## 4. Verification & Test Execution Results

### 1. Test Suite Execution (`npm test`):
Ran native Node.js test runner across all unit and integration tests:

```
TAP version 13
# Subtest: WealthGenie Backend API Endpoints
    ok 1 - GET /api/health should return 200 with service health info
    ok 2 - POST /api/calculate/sip should return deterministic projection with disclaimer
    ok 3 - POST /api/calculate/sip should return 400 for invalid inputs
    ok 4 - POST /api/ai/chat should return 400 when message is missing
    ok 5 - POST /api/ai/chat should return 503 unconfigured when GEMINI_API_KEY is not set
    ok 6 - GET /api/investments/sources should return planned official data sources
    ok 7 - GET /api/investments/historical should report honest unconnected status in Phase 0
ok 1 - WealthGenie Backend API Endpoints (158 ms)

# Subtest: Deterministic Financial Calculations & INR Formatting
    # SIP (Systematic Investment Plan) Calculation (4 tests passed)
    # Compound Interest Calculation (3 tests passed)
    # Indian Number & Currency Formatting (en-IN) (3 tests passed)
ok 2 - Deterministic Financial Calculations & INR Formatting (15 ms)

1..2
# tests 17
# suites 5
# pass 17
# fail 0
# duration_ms 467.7
```

### 2. Frontend Production Build (`npm run build:frontend`):
```
vite v6.4.5 building for production...
✓ 1965 modules transformed.
dist/index.html                   1.38 kB │ gzip:  0.74 kB
dist/assets/index-O-mrLznL.css   33.51 kB │ gzip:  6.44 kB
dist/assets/index-BYPqkNtK.js   254.78 kB │ gzip: 72.19 kB
✓ built in 4.53s
```

### 3. Backend Health Verification:
Started backend server on port 5001 and queried `GET http://localhost:5001/api/health`:
```json
{
  "status": "healthy",
  "service": "wealthgenie-backend",
  "version": "0.1.0",
  "timestamp": "2026-10-23T18:05:38.894Z",
  "aiConfigured": false,
  "nodeEnv": "development"
}
```

---

## 5. Missing Credentials & Integration Prerequisites

1. **AI Credentials**:
   - `GEMINI_API_KEY` is not populated by default in `.env.example` to prevent committing secrets.
   - *Prerequisite*: Developer must provide a genuine API key in `.env` to enable live LLM tutoring.
2. **Historical Market Data**:
   - Nifty 50 TRI and AMFI mutual fund historical NAV series are documented as planned sources in `data/sources/sources.json`.
   - *Prerequisite*: Automated fetch scripts with data cleaning, licensing verification, and deduplication pipeline in `data/raw/` and `data/processed/`.

---

## 6. Next Smallest Implementation Step

The immediate next step is **Phase 1: Official Data Ingestion Pipeline**:
- Implement an automated node script (`scripts/fetchNiftyHistorical.js`) to ingest official historical Nifty 50 TRI data into `data/raw/` and transform it into a normalized time series in `data/processed/`.
- Connect the backend `/api/investments/historical` endpoint to serve this genuine dataset to the Explore Investments page, enabling real historical benchmark backtesting.
