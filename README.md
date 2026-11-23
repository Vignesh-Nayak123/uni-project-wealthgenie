# WealthGenie — AI-Powered Financial Literacy Platform (India)

A clean, trustworthy financial-education and personal-finance web platform built for Indian beginners to learn money management without jargon, speculation, or high-risk claims. Every number shown to a user is either a deterministic calculation the user can inspect, or data from a named public source with recorded provenance — never invented.

> **Status:** educational prototype. It is **not** a SEBI-registered Investment Adviser, is not production-hardened, and has no real-user deployment. See [Regulatory disclaimer](#regulatory-disclaimer) and [Limitations](#9-data-sources-assumptions-limitations-privacysecurity-future-work).

---

## 1. Project overview — the problem it addresses

First-time investors in India face three compounding problems:

1. **Jargon-heavy, sales-driven information.** Most accessible content is aimed at selling products, not building understanding.
2. **Fabricated "AI" and fake market data in tools.** Many demos simulate an assistant with keyword matching and plot invented charts, which is actively dangerous for a beginner who cannot tell the difference.
3. **No safe place to practise.** Beginners either read theory with nothing to try, or jump into real money.

WealthGenie addresses all three by combining a structured curriculum, honest AI states, verified public data, deterministic calculators, and a paper-trading sandbox — with every metric and recommendation explained.

## 2. Who it is for

- **Primary user:** Indian beginners (students and first-jobbers) who want to learn budgeting, saving, and investing basics in rupee terms before risking money.
- **Business need the project addresses:** a trustworthy, low-risk financial-education funnel (Learn → Assess → Explore → Practise → Simulate) that could be embedded by student communities, fintech onboarding flows, or campus programs. *This is the intended positioning; no market validation has been done (see section 6).*
- **Secondary audience:** reviewers and evaluators (this is also a university research project with a reproducible evaluation harness, `experiments/`, and an IEEE-format paper draft in `paper/`).

## 3. What the project does — features and user flow

The frontend (React SPA, `frontend/src/pages/`) implements five modules plus an AI tutor:

| Module | Page | What the user can do |
|---|---|---|
| Learn | `LearnPage.jsx` | Follow a 23-concept roadmap in five branches (Money Basics, Saving, Growing Money, Investing, Financial Safety). Concepts unlock only when prerequisites are complete; each concept has a versioned lesson, worked examples, a quiz, and cited sources. |
| Assessment | `AssessmentPage.jsx` | Enter income, expenses, savings, EMIs and get computed metrics (surplus, savings rate, emergency coverage, EMI burden), a saved profile, and recommendations. |
| Explore Investments | `ExploreInvestmentsPage.jsx` | See a **readiness gate** derived from the assessment, browse index funds backed by verified AMFI/Nifty data, and receive rule-based fund recommendations. |
| Practice Trading | `PaperTradingPage.jsx` | Buy and sell with ₹1,00,000 of virtual money in a private, per-user portfolio with order history, and run **replay** sessions against historical data — no real money. |
| What-if Planner | `DigitalTwinPage.jsx` | Run what-if scenarios (income, expenses, EMI, savings, shocks) against a baseline with metric-by-metric comparison, goal projection, and explanations. |

**Typical user flow:** sign in (Supabase auth) → Learn → complete quizzes (progress syncs to the account, with a browser fallback for guests) → run the Assessment → check readiness → explore verified funds → practise in Paper Trading → rehearse life decisions in the Digital Twin.

Lesson content, quizzes and citations live in versioned files under `content/learning/v1/`, served by `GET /api/learn/lessons/:conceptId` — reading lessons never requires a Gemini key.

## 4. Engineering solution

### Architecture

Single monorepo; no microservices.

```
wealthgenie/
├── frontend/          # React 18, Vite, Tailwind CSS; pages, formatters, charts
├── backend/           # Express REST API; deterministic finance utils; market feed
│   └── src/
│       ├── routes/    # health, ai, calculate, investments, learn, progress,
│       │              # paper-trading, assessment, profile, assessments, goals,
│       │              # twin, scenarios, market, recommendations
│       ├── services/  # ai.service, supabase, paperTrading/*, recommendation/*,
│       │              # marketData/upstoxFeed.js (+ MarketDataFeedV3.proto)
│       └── utils/     # financialMath, financialAssessment, financialTwin,
│                      # learningProgress, lessonSchema, databaseErrors
├── ai/                # tutor/lesson prompts and safety guardrails (ai/safety/guardrails.json)
├── content/           # Versioned lesson content (v1) + JSON schema + sources registry
├── data/              # Raw/processed datasets, provenance registry, quality reports
├── supabase/migrations/  # profiles, assessments, goals, scenarios, learning_progress
├── experiments/       # Reproducible evaluation harness (Phase 4)
├── ml/                # Isolated Findex research experiment (NOT used by the app)
├── wealthgenie-datasets/  # Python dataset pipelines (merge, NAV metrics, holdings)
├── scripts/           # Import/validation/evaluation utilities
├── paper/             # IEEE paper draft (LaTeX)
├── docs/              # Architecture, API contracts, protocols, audits
└── tests/             # 34 node:test files (unit + integration)
```

### Key technologies

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18, Vite, Tailwind, Recharts, lightweight-charts | Fast SPA; charts render only verified datasets |
| Backend | Node.js + Express (ESM) | Lightweight REST; every calculation server-side and testable |
| Auth & persistence | Supabase (Postgres) + row-level security | Per-user progress, assessments, goals, scenarios; `user_id` always from the verified token |
| AI | Google Gemini via `GEMINI_API_KEY` | Optional tutor; honest unconfigured state when absent |
| Market data | NSE Indices (Nifty 50 TRI), AMFI NAV, optional Upstox websocket feed (`upstox-js-sdk`) | Verified history with checksums; live feed for paper trading |
| Research | Python datasets pipelines; seeded Node experiment harness | Reproducibility without runtime dependencies |

### Data flow

```
Public sources (NSE Indices, AMFI, banks' pages, SEBI/RBI links)
        │  import scripts + checksums
        ▼
data/raw/  →  data/processed/*.csv|json  →  backend dataset loaders
        ▼                                   (verified fund cards, historical charts)
User inputs ──▶ Express API ──▶ deterministic utils (SIP, compound growth,
                │                Financial Twin, recommendation rules)
                │                     │
                ├─▶ Gemini (optional tutor)   ──▶ honest unconfigured state
                └─▶ Supabase (auth + user-scoped tables with RLS)
                          │
                          ▼
        React UI (en-IN ₹ formatting enforced in frontend/src/utils/formatters.js)
```

### Important design choices

1. **No fake AI and no fake market data.** The assistant goes through the backend and honestly reports an unconfigured setup when no `GEMINI_API_KEY` exists; Explore Investment charts use only verified Nifty 50 TRI / AMFI NAV data with provenance in `data/sources/sources.json` (retrieval dates, checksums, coverage).
2. **Determinism over ML.** Recommendations are rule-based and explainable. A collaborative-filtering/ML recommender was deliberately **not** deployed because the repo holds no verified user–fund interaction dataset (`data/reports/evaluation_report.md`, "Documented limitations").
3. **Calculations are labelled as projections, never predictions.** The Digital Twin always marks output as an estimate (`docs/DIGITAL_TWIN.md`).
4. **Provenance is mandatory.** Raw and processed data are separated; every registry entry carries provider, coverage, access rules, and SHA-256 checksums.
5. **User-scoped data with RLS.** Migrations in `supabase/migrations/`; ownership enforced in `backend/src/middleware/auth.js` and every route (covered by `tests/ownershipRoutes.test.js`, `tests/protectedRoutes.test.js`).
6. **Measured, reproducible evaluation.** `npm run experiment` regenerates a full report from a fixed seed; `docs/RESEARCH_EVALUATION.md` is a generated artifact.
7. **ml/ is isolated.** The Global Findex classifier experiment (`ml/train.py`) is survey-response research preserved for auditability; it is not imported by any production code path (`ml/README.md`).

## 5. Measured results

All numbers below come from executable or recorded evidence in this repository. Three evidence classes are distinguished: **unit/integration tests**, **offline experiments** (synthetic data, local runs), and **production outcomes** (none — see below). Test suite, content validation, coverage and the frontend production build were re-run and verified on **2026-11-10**.

### 5.1 Unit and integration tests (verified 2026-11-10)

| Metric | Value | Method | Source |
|---|---|---|---|
| Test suites / tests passing | 107 suites, 469 tests, 0 failures | `node --test` run (`npm test`) | `tests/*.test.js` (34 files) |
| Line test coverage | **87.68% statements / 87.68% lines / 89.89% functions / 77.2% branches**; by area: `backend/src/utils` 94.85%, `services/recommendation` 95.47%, `experiments/lib` 97.9%, `frontend/src/utils` 96.04%, `services/paperTrading` 85.15% (simulationService 83.05%, replayService 90.9%), `services/marketData` 82.45%, `routes` 76.1%, `scripts/` 48.85% | `c8` over `node --test tests/*.test.js` (469 tests, 0 failures) | `tests/*.test.js`; measured 2026-11-10 |
| Learning-content validation | 5 branches, 23 concepts, 23 lessons, 16 sources, 0 errors, 0 warnings | `node scripts/validateLearningContent.js` | `content/learning/v1/`, `scripts/validateLearningContent.js` |
| Frontend production build | **Succeeds**: 2,624 modules in ~23 s; output `dist/index.html` 1.38 kB, CSS 47.57 kB (8.38 kB gzip), JS 1,283.86 kB (354.88 kB gzip). Vite warns the single JS chunk exceeds 500 kB — code-splitting (`manualChunks` / dynamic import) is not yet applied | `npm run build:frontend` (vite v6.4.5) | `frontend/`; measured 2026-11-10 |
| Codebase size | `frontend/src` 13,230 lines; `backend/src` 9,642 lines; `tests/` 8,746 lines (34 files) | `*.js`/`*.jsx` line counts | Working tree, 2026-11-10 |

### 5.2 Offline experiment — assessment engine & Digital Twin (Phase 4)

Synthetic seeded dataset: **226 profiles** (200 random + 26 edge cases), **1,416 scenario cases**, **1,642 evaluated results**, vs an independent reference implementation. Fixed seed `20261027`, Node v22, Windows x64.

| Metric | Value | Method | Source |
|---|---|---|---|
| Formula correctness (14 core metrics) | 22,988 / 22,988 assertions (100%) | Engine vs independent reference (`experiments/lib/reference.js`) | `experiments/results/run-20261027T170406Z-seed-20261027/run.json`; report: `docs/RESEARCH_EVALUATION.md` |
| Goal correctness (11 goal fields) | 18,062 / 18,062 (100%) | Same | Same |
| Recommendation trigger agreement | 11,494 / 11,494 decisions (100%); 1,642 / 1,642 exact-set | Same | Same |
| Scenario comparison correctness | 1,48,680 / 1,48,680 (100%) | 13 metrics × 5 comparison values × 1,416 scenarios | Same |
| Input validation | 31/31 invalid rejected with matching messages; 5/5 valid accepted | Finite adversarial suite | Same |
| Determinism | 1,642 / 1,642 repeated results identical | Re-serialization comparison (same process) | Same |
| Directional invariants | 1,172 / 1,172 applicable checks (100%); 410 N/A | Seven one-input-change rules | Same |
| Explainability coverage | 2,61,857 / 2,61,857 applicable checks (100%) | Presence of formula, inputs, reason, assumptions, heuristic labels | Same |

**What this does and does not show (from `docs/RESEARCH_EVALUATION.md` §8–9):** these rates measure *implementation consistency against a second implementation of the same spec* — not an external oracle, not real-world predictive accuracy, and not user benefit. Synthetic profiles are a deterministic test fixture, not a population sample.

### 5.3 Offline experiment — recommendation engine & dataset pipeline

Recorded executed run: `data/reports/evaluation_report.md` (generated 2026-11-02 by `scripts/evaluateRecommendations.mjs`); dataset quality: `data/reports/data_quality_report.json`.

| Metric | Value | Method | Source |
|---|---|---|---|
| Recommendation API latency | cold 44–139 ms; p50 27–54 ms; p95 64–98 ms; mean 39–59 ms across 3 profiles | 12 measured requests per profile (warm catalog excluded from percentiles) | `data/reports/evaluation_report.md` |
| Recommendation constraint safety | 216 recommendations re-validated, 0 constraint violations | Post-engine re-check of all outputs | Same |
| Recommendation payload determinism | Byte-identical across repeated runs, all 3 profiles | Byte-compare of responses | Same |
| Dataset merge integrity | 38,495 rows; 11,417 matched with details; 27,078 unmatched preserved; **0 row multiplication** | Join audit in Python pipeline | `wealthgenie-datasets/`; report in `data/reports/` |
| NAV metrics coverage | 38,475 funds from 3,77,03,595 NAV observations (1Y: 29,888; 3Y: 19,968; 5Y: 7,788 funds; volatility: 34,960) | Computed from raw NAV history | `data/processed/fund_nav_metrics.csv` (+ manifest) |
| Holdings snapshot | 24 of 24 target funds name-matched, 288 snapshots | Match of AMC factsheet holdings rows | `data/processed/fund_holdings_metrics.csv` |
| Engine catalog | 8,885 active funds; 8,684 with Riskometer; 7,999 with TER; 7,769 with 1-Y history | Catalog assembly from merged dataset | Evaluation report |
| Market-data coverage | Nifty 50 TRI: 4,170 sessions, 2010-01-04 → 2026-10-23; AMFI NAV: 694 observations each for UTI (120716) and HDFC (119063) direct-growth index funds, 2024-01-01 → 2026-10-23 | Import scripts with SHA-256 checksums and retrieval dates | `data/sources/sources.json` |

### 5.4 Production outcomes

**None demonstrated.** The project has no hosted production deployment serving real users, no user counts, no engagement, no revenue, and no A/B evidence. The hosted-Supabase migration verification is explicitly pending (`docs/RESEARCH_EVALUATION.md` §9.8). Anything beyond the tables above is **intended benefit, not measured result**.

## 6. Business impact

**Verified (from repo evidence only):**
- The trust positioning was *implemented and enforced*: zero fabricated data paths, honest AI states, and full explainability coverage (§5.2) — verified by automated checks, not user opinion.
- Deterministic, reproducible behaviour is measurable and was measured (§5.2–5.3), which is a concrete engineering asset for any partner evaluating reliability.
- Content is complete and machine-validated: 23/23 concepts lesson-complete with 16 registered sources (§5.1).

**Intended but not measured (no user study, no deployment):**
- Beginner comprehension, trust, and financial-literacy improvement — requires the user study designed but not executed in `docs/VALIDATION_PROTOCOL.md` (RQ7–RQ10: "Not studied").
- Business value as an education/onboarding funnel for institutions — no customer, pilot, or market data exists in the repository.
- Any claim of reduced fraud susceptibility or improved saving behaviour — **not measured**; would need a longitudinal or randomized field study.

## 7. What improved compared with the prior approach

**Baseline:** the pre-"Phase 0" prototype documented in `docs/walkthrough.md` — a single-folder React app with USD mock data, US-centric content, and client-side keyword "AI" simulation. The file inventory in `docs/walkthrough.md` is the evidence for what existed before.

Improvements demonstrable against that baseline:

| Area | Baseline (per `docs/walkthrough.md`) | Now (evidence) |
|---|---|---|
| Currency & context | USD mocks, US accounts | INR/en-IN enforced everywhere (`frontend/src/utils/formatters.js`, `tests/calculations.test.js`) |
| "AI" | Client-side keyword simulation | Backend-routed Gemini with honest unconfigured state (`backend/src/routes/ai.routes.js`) |
| Market data | Arbitrary mock charts/APYs | Verified Nifty/AMFI series with provenance and checksums (`data/sources/sources.json`) |
| Testing | 2 test files | 34 test files, 469 tests, 0 failures, 87.7% line coverage (§5.1) |
| Evaluation | None | Reproducible harness, 1,642 synthetic results, published report (`experiments/`, `docs/RESEARCH_EVALUATION.md`) |

**No valid comparison exists for:** whether the assessment + Digital Twin adds decision-support value over a static assessment, or whether the platform improves user outcomes. `docs/VALIDATION_PROTOCOL.md` records RQ7 (decision-support value over static assessment) as "Not studied". A fair comparison would be a randomized or within-subject task study: same tasks performed with and without the Digital Twin, scored against a pre-registered rubric — designed (not executed) in Phase 5.

## 8. How to install, configure, run, and test

### Prerequisites
- Node.js ≥ 18 (verified on v22.16.0), npm ≥ 9 (verified on 10.9.2)
- Optional: Python for dataset pipelines (`wealthgenie-datasets/`, `ml/`); Gemini API key for the AI tutor; Supabase project for auth/persistence

### Install
```bash
npm --prefix backend install
npm --prefix frontend install
```

### Configure
```bash
cp .env.example .env     # backend loads root .env or backend/.env; restart after changes
```
Relevant variables (see `.env.example`): `PORT` (5001), `NODE_ENV`, `GEMINI_API_KEY` / `GEMINI_MODEL`, `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`. Without Gemini the app runs in safe unconfigured mode; without Supabase, authenticated features degrade to the documented guest/fallback behaviour.

### Run
```bash
npm run start:backend      # or dev:backend (watch mode)  → http://localhost:5001
npm run dev:frontend       # → http://localhost:5173, /api proxied to 5001
```

### Test and validate
```bash
npm test                                   # 34 files: math, roadmap, lessons, API, twin, auth, paper trading…
npx c8 --reporter=text node --test tests/*.test.js   # same suite with V8 coverage (87.68% lines)
npm run build:frontend                     # production build
npm run validate:content                   # lesson content & completeness gate
npm run validate:data                      # dataset quality gate
npm run import:nifty / import:amfi         # refresh verified market data
```

### Reproduce the research experiment
```bash
npm run experiment          # writes timestamped output to experiments/results/
npm run experiment:publish  # also regenerates docs/RESEARCH_EVALUATION.md
npm run experiment:verify -- experiments/results/<run>   # checksum-vs-manifest audit
```

## 9. Data sources, assumptions, limitations, privacy/security, future work

### Data sources
Registered with provenance in `data/sources/sources.json`:
- **NSE Indices** — Nifty 50 TRI daily series (4,170 sessions; non-commercial educational use).
- **AMFI** — NAV master and NAV history for UTI 120716 and HDFC 119063 direct-growth index funds; fund dataset pipelines use AMFI NAVAll/master plus AMC factsheets (`wealthgenie-datasets/`).
- **SEBI** — investor-education and Riskometer material (linked, not mirrored).
- **RBI** — banking/deposit statistics, FD rates, financial-education and DICGC insurance guidance (documented for manual collection; FD rates currently **not connected** — no rates stored).
- **Global Findex 2025 (India)** — survey microdata for the isolated `ml/` experiment only.

### Assumptions
- Deterministic finance model: constant user contributions, no investment returns/inflation/taxes/borrowing/asset sales modelled (`docs/DIGITAL_TWIN.md`, `docs/RESEARCH_EVALUATION.md` §9.4).
- Thresholds (3-month coverage, 40% EMI burden) are documented heuristics, not expert-validated values.
- Equalities in the experiment use a relative tolerance of 1e-9.

### Limitations (measured-state gaps)
1. **The reference implementation is in-project** — agreement is not external validation.
2. **Synthetic, hand-designed profiles; finite one-input-at-a-time scenario suite; single platform/process determinism.**
3. **No user study** — comprehension, trust and literacy effects are unknown (`docs/VALIDATION_PROTOCOL.md`).
4. **NAV precision artifact:** liquid/overnight-fund NAV rounding can inflate volatility estimates (penalizing but never rewarding a fund); documented rather than smoothed (`data/reports/evaluation_report.md`).
5. **~70% of merged rows lack a Riskometer** (legacy/inactive schemes); they are excluded and flagged, never imputed.
6. **Hosted Supabase deployment not yet verified.**
7. **Screenshots:** no application screenshots or rendered figures are committed (only LaTeX figure placeholders in `paper/`); see `paper/README.md` for the capture guide.
8. **Coverage is uneven:** route handlers (76.1%) and data-import scripts (48.85%) are the least-covered areas; core calculation utils, the recommendation engine and experiment harness sit at 95–98%. The frontend production build emits a single 1.28 MB JS chunk (355 kB gzip) without code-splitting.

### Privacy & security
- Auth via Supabase; `user_id` always derived from the verified token, never the request body; all queries scoped by id **and** owner; row-level security in `supabase/migrations/`.
- Only the publishable/anon key is used client/backend-side; the service-role key must never be in `.env` (warned in `.env.example`).
- Paper-trading state persists locally in `backend/src/data/*.json`; no real money or brokerage execution. The optional Upstox feed is read-only market data.
- `.gitignore` keeps raw CSVs (e.g. Findex microdata) out of Git; no personal data is collected by the platform itself.

### Future work
1. Execute the Phase 5 validation protocol (expert content review; then a comprehension/trust user study per `docs/VALIDATION_PROTOCOL.md`).
2. Complete hosted-Supabase migration verification; add a Lighthouse baseline; reduce the frontend bundle via code-splitting (current single JS chunk 1.28 MB / 355 kB gzip exceeds Vite's 500 kB warning); raise coverage in `backend/src/routes` (76.1%) and `scripts/` (48.85%).
3. A/B-style comparison of static assessment vs assessment + Digital Twin (RQ7 in `docs/VALIDATION_PROTOCOL.md`).
4. For the ML recommender (see `ml/`): only with a verified user–fund interaction dataset, and after mapping survey features to collected inputs — the repo currently provides neither.
5. Finish the paper's screenshot capture (`paper/README.md`).

## Regulatory disclaimer

WealthGenie is an educational financial-literacy prototype for Indian beginners. It is not a SEBI-registered Investment Adviser (RIA), research analyst, or portfolio manager. All content is for educational literacy only; calculations are mathematical projections based on user inputs, not guarantees. Data providers' terms apply (see `data/sources/sources.json`).
