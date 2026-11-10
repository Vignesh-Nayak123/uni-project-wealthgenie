# Learning Content and Progress: Setup, Review Status and Verification

This document describes the Learn section as shipped: versioned lesson content,
the backend API that serves it without an AI provider, and per-user progress
persistence.

## 1. Architecture

- **Curriculum source of truth**: `backend/src/data/learningRoadmap.js` (23
  concepts, 5 branches, prerequisite graph).
- **Lesson content**: `content/learning/v1/lessons/<conceptId>.json`, one file
  per concept.
- **Structural contract**: `content/learning/v1/lesson.schema.json`.
- **Cross-document validator**: `backend/src/content/lessonContract.js`.
- **Source registry**: `content/learning/v1/sources.json` (16 sources). Every
  lesson and example citation must resolve here.
- **Loader and cache**: `backend/src/content/loadContent.js` and
  `backend/src/content/curatedLessons.js`. A lesson that fails validation is
  withheld rather than served.
- **API**: `backend/src/routes/learn.routes.js`
  - `GET /api/learn/curriculum`
  - `GET /api/learn/lessons`
  - `GET /api/learn/lessons/:conceptId`
  - `POST /api/learn/lesson` (optional AI path, unchanged)
- **Frontend**: `frontend/src/components/learning/LessonPanel.jsx` requests the
  curated lesson first. Only a `404 lesson_not_available` falls through to the
  optional AI path.
- **Progress API**: `backend/src/routes/learningProgress.routes.js`, mounted at
  `/api/learn/progress`.

## 2. Content completeness

All 23 concepts have a lesson file with objectives, explanations, worked
examples, key takeaways, a three-question quiz (one question per objective,
with explanations), citations, a review record and a disclaimer.

| # | Concept | Branch | Status |
|---|---------|--------|--------|
| 1 | income | Money Basics | source-checked, awaiting human review |
| 2 | expenses | Money Basics | source-checked, awaiting human review |
| 3 | budgeting | Money Basics | source-checked, awaiting human review |
| 4 | saving-money | Saving | source-checked, awaiting human review |
| 5 | emergency-funds | Saving | source-checked, awaiting human review |
| 6 | inflation | Saving | source-checked, awaiting human review |
| 7 | simple-interest | Growing Money | source-checked, awaiting human review |
| 8 | compound-interest | Growing Money | source-checked, awaiting human review |
| 9 | risk-and-return | Growing Money | source-checked, awaiting human review |
| 10 | bank-deposits | Investing | source-checked, awaiting human review |
| 11 | fixed-recurring-deposits | Investing | source-checked, awaiting human review |
| 12 | stocks | Investing | source-checked, awaiting human review |
| 13 | mutual-funds | Investing | source-checked, awaiting human review |
| 14 | index-funds | Investing | source-checked, awaiting human review |
| 15 | sips | Investing | source-checked, awaiting human review |
| 16 | diversification | Investing | source-checked, awaiting human review |
| 17 | fees-expense-ratios | Investing | source-checked, awaiting human review |
| 18 | investment-time-horizon | Investing | source-checked, awaiting human review |
| 19 | risk-tolerance | Investing | source-checked, awaiting human review |
| 20 | upi-safety | Financial Safety | source-checked, awaiting human review |
| 21 | digital-financial-fraud | Financial Safety | source-checked, awaiting human review |
| 22 | borrowing-interest | Financial Safety | source-checked, awaiting human review |
| 23 | credit-scores | Financial Safety | source-checked, awaiting human review |

`status` is `source-checked`, not `reviewed`. Every lesson has
`reviewedBy: null` and `reviewedAt: null`. The UI renders the backend label
"Source checked — awaiting human review" verbatim and never upgrades it.

## 3. What was actually verified

The following primary documents were downloaded or fetched on 2026-10-28 and
checked against the lesson claims:

- **RBI FAME, 4th edition** (PDF downloaded and text-extracted): Messages 1–3,
  6–8, 10–11, 13–16 and 20. This supports the budgeting identity, passive vs
  active savings, deposit types, premature-withdrawal penalty, credit-score
  facts, simple-interest formula and the 2%-per-month warning, the compounding
  figures (₹11,000 / ₹12,100 / ₹13,310 and ₹20,000 vs ₹26,851), the real-return
  definition, the risk–return principle, diversification, and the ₹5 lakh
  DICGC limit with the same-right/same-capacity rule.
- **RBI Ombudsman BE(A)WARE booklet** (PDF downloaded and text-extracted):
  UPI collect-request and QR-code fraud patterns, reporting helplines 155260
  and 1930, and cybercrime.gov.in.
- **RBI press release 2021-2022/1630** (`prid=53185`): vishing, phishing,
  remote-access apps, UPI collect requests, fake bank numbers and safe digital
  banking practices.
- **DICGC Information Leaflet 2024-25** (PDF downloaded and text-extracted):
  ₹5,00,000 cover for savings, fixed, current and recurring deposits; premium
  borne by the insured bank.
- **SEBI "Understanding Mutual Funds"**: pooling, professional management, NAV
  published daily, no guaranteed return.
- **SEBI "Index Mutual Funds"**: passive tracking and tracking error.
- **SEBI "How to Manage Investment Risks"**: diversification across asset
  classes and matching investments to the horizon.
- **SEBI "Understanding Shares"**: shares as part-ownership, dividends not
  guaranteed, market risk.
- **SEBI "Key Risks in Investing in Securities Market"**: market, inflation,
  liquidity, business, volatility and currency risk.
- **AMFI "Systematic Investment Plan (SIP)"**: fixed amount at fixed intervals,
  ₹500 minimum, rupee-cost averaging example, no assurance of profit.
- **AMFI "Expense Ratio"**: TER deducted from NAV, SEBI-prescribed limits,
  daily disclosure.
- **AMFI "Investor Corner"**: general mutual-fund education and the explicit
  statement that a mutual fund is not a deposit and returns are not guaranteed.

### Not independently retrievable

- `npci.org.in` safety and fraud pages return HTTP 403 to automated requests
  and render client-side. **No lesson claim depends on NPCI text.**
- `cybercrime.gov.in` / `i4c.mha.gov.in` could not be independently retrieved.
  The reporting helplines and portal name are cited from the RBI Ombudsman
  booklet instead.

### Still requiring human review

All 23 lessons require a named human reviewer before their status can move from
`source-checked` to `reviewed`. The validator enforces that a `reviewed` lesson
has a reviewer name and review date. No human approval is claimed anywhere.

## 4. Progress persistence and RLS

### Database

Migration: `supabase/migrations/20261028120000_learning_progress.sql`.

- Table `public.learning_progress`, one row per user.
- `user_id uuid primary key references auth.users (id) on delete cascade`.
- `completed_concept_ids text[]` with a cardinality constraint.
- `quiz_progress jsonb` constrained to an object, storing the best attempt per
  concept.
- Index on `updated_at`.
- RLS enabled with separate select/insert/update/delete policies, all requiring
  `(select auth.uid()) = user_id`.
- `anon` privileges revoked; `authenticated` granted select/insert/update/delete.
- `updated_at` maintained by the existing `public.set_updated_at()` trigger.

**This migration has not been applied to any hosted database in this run.**
Apply it manually with either:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

or paste the file into the Supabase dashboard SQL editor after the four earlier
migrations. See `docs/SUPABASE_SETUP.md`.

### API

All routes require a Supabase bearer token and derive the owner from the
verified token, never from the request body.

- `GET /api/learn/progress` — current snapshot.
- `PUT /api/learn/progress` — replace snapshot.
- `POST /api/learn/progress/merge` — union completed concepts and keep the best
  quiz attempt. Used on sign-in and after every local change.
- `DELETE /api/learn/progress` — reset the signed-in user's row.

### Browser fallback and merge

`frontend/src/utils/learningProgress.js` still stores progress under
`wealthgenie.learningProgress.v1`. On sign-in, the local snapshot and the
account snapshot are merged: completed concepts are unioned (subject to the
prerequisite graph) and the best quiz score per concept wins. If the progress
table or API is unavailable, the UI keeps working from browser storage and
shows an honest warning instead of failing.

Browser snapshots also carry an `ownerUserId`. A snapshot with no owner is guest
progress and merges into whichever account signs in next. A snapshot owned by a
different user is ignored rather than merged, so signing into a second account
on the same browser cannot import the first user's completed lessons.

## 5. Verification commands

```bash
node scripts/validateLearningContent.js
node scripts/validateLearningContent.js --require-complete
node --test tests/learningContentContract.test.js
node --test tests/lessonSchema.test.js
node --test tests/learnLessonsApi.test.js
node --test tests/learningProgressApi.test.js
node --test tests/learningProgressState.test.js
npm test
npm run build:frontend
```

`npm test` is the full backend/content suite (`node --test tests/*.test.js`).
The frontend has no separate test runner configured; the pure progress and quiz
logic is covered by the root Node test suite, and the production build is the
frontend check.

## 6. Manual verification checklist

1. Apply the migration and configure Supabase (see `docs/SUPABASE_SETUP.md`).
2. Start backend and frontend.
3. Sign in and open `#learn`.
4. Open any lesson. Confirm no `POST /api/learn/lesson` request is made while
   the curated lesson loads, even with `GEMINI_API_KEY` set.
5. Answer a question wrongly, then correctly; confirm feedback and the
   "Try again" flow.
6. Complete all three questions and the concept; confirm the next node unlocks.
7. Refresh; confirm the completion survives.
8. Sign in as a second user; confirm the first user's progress is not visible.
9. Temporarily remove the migration (or use a project without it) and confirm
   the UI falls back to browser progress with a warning rather than crashing.
