# WealthGenie — Personalized Mutual Fund Recommendation System

Explainable, risk-aware fund guidance built on **verified datasets only**. The
system is fully deterministic: every number shown to a user is traceable to a
processed AMFI/SEBI dataset row or the user's own profile — nothing is invented,
zero-filled or imputed. Gemini is used **only** to reword finished structured
results, never to make decisions.

---

## 1. Architecture

```mermaid
flowchart LR
    subgraph Sources["wealthgenie-datasets/ (read-only)"]
        SM[scheme_master.csv.csv<br/>38,495 schemes]
        SD[scheme_details.csv.csv<br/>11,417 richer SSD rows]
        NAV[nav_history.parquet<br/>3.77 crore NAV rows]
        PF[portfolio_holdings.csv.csv<br/>22,236 rows / 24 funds]
    end

    subgraph Pipelines["Python pipelines (idempotent, read-only on sources)"]
        MERGE[build_fund_dataset.py<br/>verified 1:1 merge on scheme_code]
        QUAL[report_data_quality.py<br/>13 quality checks]
        NAVM[build_nav_metrics.py<br/>1Y/3Y/5Y · vol · drawdown]
        HOLD[build_holdings_metrics.py<br/>allocation · concentration]
    end

    subgraph Processed["data/processed/"]
        F1[wealthgenie_funds.csv<br/>+ manifest]
        F2[fund_nav_metrics.csv]
        F3[fund_holdings_metrics.csv]
    end

    subgraph Engine["Node engine · backend/src/services/recommendation/"]
        LNDR[fundData.js<br/>cached catalog loader]
        READINESS[readiness.js<br/>deterministic financial-readiness math]
        CAT[engine.js + categories.js<br/>Stage 1–2: profile & readiness,<br/>then category ranking]
        FUNDS[funds.js<br/>Stage 3–5: fund eligibility,<br/>transparent scoring, output]
        IDX[index.js<br/>orchestrator + payload contract]
    end

    ROUTE[POST /api/recommendations<br/>recommendations.routes.js<br/>requireAuth · RLS goals · structured logs]

    GEMINI[narrator.js<br/>optional Gemini rewording<br/>— never a decision maker]

    UI[frontend ExploreInvestmentsPage<br/>"Personalized guidance" section]

    SM --> MERGE
    SD --> MERGE
    MERGE --> F1
    NAV --> NAVM --> F2
    PF --> HOLD --> F3
    QUAL --> QR[data/reports/data_quality_report.json]

    F1 --> LNDR
    F2 --> LNDR
    F3 --> LNDR
    LNDR --> FUNDS
    FUNDS --> IDX
    READINESS --> CAT
    CAT --> FUNDS
    CAT --> IDX
    IDX --> ROUTE
    ROUTE --> GEMINI
    ROUTE --> UI
```

Key invariant: **hard eligibility constraints are gates, not weights.** A
ranking score can never rescue a fund that failed an eligibility check, and an
ineligible *category* pool is never consulted for funds at all.

---

## 2. Data pipeline (reproducible & idempotent)

Run from the repository root; sources are never modified:

```bash
python wealthgenie-datasets/build_fund_dataset.py     # merge + cleaning manifest
python wealthgenie-datasets/report_data_quality.py    # 13-check quality report
python wealthgenie-datasets/build_nav_metrics.py      # NAV features (long: ~5 min, 3.77 cr rows)
python wealthgenie-datasets/build_holdings_metrics.py # holdings metrics + name-match manifest
```

### Merge contract (verified before any join was attempted)

- `scheme_code` unique on both sides (38,495 master / 11,417 details);
  details is a strict subset → master **LEFT JOIN** details, 1:1.
- Aborts with a blocker if duplicates or row multiplication are ever detected
  (38,495 → 38,495; multiplication = 0).
- `details_matched` flag keeps the **27,078 unmatched rows preserved** — never
  deleted, never fabricated.
- Cleaning (documented in the merge manifest, no silent zero-fill):
  - `riskometer = coalesce(ssd_riskometer_level, amfi_daily_riskometer, ssd_riskometer)`
    normalized to SEBI labels with per-row `riskometer_source`; off-scale
    labels stay **null** (documented, not guessed).
  - `benchmark = coalesce(ssd_benchmark_tier1_std, amfi_daily_benchmark)`.
  - `category_primary = coalesce(ssd_sebi_category, master.category)`;
    fresher details-side `category_group_clean` preferred.
  - TER kept verbatim per plan (`ter_regular` / `ter_direct`) with `ter_date`.

### Quality snapshot (data/reports/data_quality_report.{json,txt})

13 checks, current run: 38,495 records; 0 duplicate ids; 0 missing names or
categories; 0 invalid NAVs; 21 implausible TERs left unrepaired; 7,790 rows
with neither plan TER; Riskometer present for 11,190 rows (70.9% missing —
dominated by inactive legacy schemes without details disclosures); unmatched
27,078 preserved. **No row is deleted and no value imputed anywhere.**

### NAV metrics sufficiency rule

A horizon (1Y/3Y/5Y) is computed only when the actual observation span covers
≥ 97% of the window **and** ≥ 12 observations exist inside it. Otherwise the
metric stays `null` and the fund list names the horizon in
`insufficient_horizons` — no estimates for under-evidenced funds. Volatility
annualizes log-return std by the *real* median observation gap (gaps > 15 days
excluded); drawdown uses the full series. Outputs: 38,475 funds; populated
1Y 29,888 / 3Y 19,968 / 5Y 7,788 / volatility 34,960 / drawdown 34,993.

### Holdings limitation (explicit)

Holdings are keyed by an AMC-style `fund_code` absent from the scheme-code
domain, so matching is a **best-effort normalized-name match** (24/24 funds
matched, kept in the manifest). Only 24 funds disclose holdings —
concentration/allocation is enrichment context, never a scoring factor.

---

## 3. Financial readiness (deterministic)

Computed from the existing WealthGenie profile fields by
`backend/src/services/recommendation/readiness.js` — no conflicting schema:

| Quantity | Formula and guards |
|---|---|
| Monthly surplus S | `income − expenses − (EMIs when not already inside expenses)` — EMI double-count guard |
| Emergency coverage | `liquid savings ÷ essential expenses`; unknown (null) when inputs missing |
| Savings rate | `S ÷ income × 100`; null at zero income (never a fabricated %) |
| Debt burden | `EMIs ÷ income × 100` |
| Investable surplus | `S` (halved while emergency coverage < 3 months) |
| Required monthly contribution | `(target − saved) ÷ remaining months` per goal; null for past/no-date goals |
| Derived risk capacity | 1–5 from income stability, surplus, cushion, debt — never from stated tolerance alone |

Insufficient financial information is reported as `missingMaterial` with an
explanation; negative surplus yields the `no-suitable-investment-now` outcome,
prioritizing readiness guidance over fund suggestions.

---

## 4. Recommendation engine

### Stage 1–2 (profile & readiness) → category ranking (`engine.js`)

Fixed weights: `horizonFit 0.30 · riskFit 0.25 · liquidityFit 0.20 ·
goalAlignment 0.25`. Risk interpretation maps the **min(Fund-level derived
capacity, stated tolerance)** to category Riskometer bands — equity is never
auto-recommended to a stressed profile.

### Stage 3 (fund eligibility — hard gate, `funds.js`)

Eligible category pools (`CATEGORY_FUND_POOLS`, verified against real
distributions) map to fund rules. Per fund, all must pass:

1. Riskometer present and inside the pool band (e.g. gold funds verified to be
   High/Very High → band 4–6; liquid 1–3; index-equity 3–6; retirement 3–6).
2. Category group + category/name regex matches the pool.
3. Investment horizon ≥ pool minimum.
4. TER disclosed for at least one plan.
5. NAV history exists and is ≤ 30 days fresh (`MAX_NAV_FRESHNESS_DAYS`).
6. Pool-required return window (e.g. 3Y for equity) actually computable.

Failures are counted by rule class in `funds.exclusionsSummary` and never
overridden by any score.

### Stage 4 (transparent scoring)

| Factor | Weight | Normalization |
|---|---|---|
| riskAlignment | 0.30 | `max(0, 1 − \|effectiveRisk − fundLevel\| ÷ 4)` |
| expenseRatio | 0.20 | linear 0.10% → 1 … 2.50% → 0 (best plan TER; direct wins ties) |
| volatility | 0.15 | linear 2% → 1 … 30% → 0 |
| maxDrawdown | 0.15 | linear 15% → 1 … 60% → 0 |
| consistency | 0.15 | positive rolling-year fraction (0–1) |
| dataCompleteness | 0.05 | share of present: TER, benchmark, 3Y history, holdings, fresh NAV |

Anti-pattern guards: **returns are displayed but never scored**; AUM is
excluded entirely; missing data scores a neutral 0.5 (never rewarded); only
the best variant per fund family is kept (plans deduped). The only returns
shown are dressed with "shown for transparency, NOT used in the ranking".

### Stage 5 (explainable output)

Every fund carries scheme code/name, AMC, category, plan, Riskometer (+level),
TER with as-of, NAV + as-of + freshness, five historical metrics, score +
per-factor breakdown, deterministic reasons, risk warnings, benchmark and
`dataAsOf`.

---

## 5. API contract

`POST /api/recommendations` (`backend/src/routes/recommendations.routes.js`)

- Auth: existing `requireAuth`; goals are loaded through the caller's own
  RLS-scoped `req.supabase` — a body-supplied user id is never trusted.
- Input: `{ profile: {...}, fundLimit?: 1–10 (clamped, default 6) }`.
- Response: `success`, `profileSummary` (riskProfile / readinessStatus),
  `recommendations` (funds), `categoryRecommendations` (categories),
  `readiness`, `funds` (stage meta: status + exclusions + published scoring),
  `explanation` (deterministic text; `generative` only when Gemini succeeds),
  `disclaimer`. Dataset-missing datasets degrade to
  `funds.status='unavailable'` with an actionable note — category guidance
  remains; nothing crashes.
- Structured JSON logs (status, durationMs, counts); errors return readable
  messages, stack traces stay server-side.

## 6. Frontend

`frontend/src/pages/ExploreInvestmentsPage.jsx` → "Personalized guidance":
readiness stats, priorities, outcome, ranked **category** cards and
**verified fund** cards (`FundRecommendationsSection`) with riskometer badge,
TER badge, NAV + freshness, historical metrics, per-factor score breakdown,
reasons and warnings — plus loading / error / no-profile-data / empty and
dataset-unavailable states. Fonts and components reuse the existing design
system; no new dependencies.

---

## 7. ML / Gemini limitation statement (research framing)

The repository holds **no verified user–fund interaction dataset**, so
collaborative filtering is not grounded and was **deliberately not deployed**.
The in-app risk interpretation remains deterministic (documented 1–5 mapping +
rule-gated capacity derivation). No classifier exists to evaluate; therefore
no test-set metrics are claimed. If interaction data is ever collected, a
content-based learning stage could extend the scoring — it must be evaluated
against a majority-class baseline with macro-F1 and documented leakage
controls before replacing rules. Gemini (`narrator.js`) is constrained by
prompt rules to reword **only** structured results and may never introduce
fund names, NAVs, returns or suitability decisions; any failure keeps the
deterministic explanation.

---

## 8. Reproducible evidence for the IEEE paper

| Evidence | Artifact (current measured values inside) |
|---|---|
| Dataset statistics & quality | `data/reports/data_quality_report.{json,txt}`, `data/processed/*_manifest.json` |
| Engine & NAV features | `data/processed/fund_nav_metrics{_manifest}` (population rates per metric) |
| API latency / determinism / constraint safety / tests | `data/reports/evaluation_report.{json,md}` — regenerate with `node scripts/evaluateRecommendations.mjs` |
| Latest measured run | p50 37–56 ms · p95 61–205 ms · determinism byte-identical · **216 recommendations re-validated, 0 violations** · 448/448 tests |

Automated tests: `tests/fundRecommendation.test.js` (fund stage, 20),
`tests/recommendationEngine.test.js` + `tests/recommendationRoutes.test.js`
(engine & API). Full suite: `node --test "tests/**/*.test.js"`.

## 9. Run locally

```bash
# 1. one-time data build (see §2)
# 2. backend
cd backend && npm install && npm run dev          # port 5001 (dev)
# 3. frontend
cd frontend && npm install && npm run dev         # Vite dev server
# 4. evaluation / reports
node scripts/evaluateRecommendations.mjs
```

Secrets come from environment variables only (`GEMINI_API_KEY`,
`SUPABASE_*`); none are committed. Real-data smoke with a fake RLS client and
factory router never boots a second production server.
