# Financial Digital Twin (Phase 3)

**Status:** Implemented locally. No ML model, no new runtime dependencies, and no
change to the existing assessment API or its response shape.

The Digital Twin is a deterministic what-if calculator built on the existing
assessment validation helpers. It recalculates a baseline and a modified
scenario independently, compares them, and explains every metric and
recommendation. It is an **estimate**, not a prediction of actual outcomes.

---

## 1. Architecture

```
POST /api/twin/preview                 (authenticated, no persistence)
  -> buildTwinPreview()
       -> normalizeTwinInputs()        (baseline)
       -> normalizeTwinInputs()        (baseline + scenario overrides)
       -> calculateTwin()              (baseline, independent)
       -> calculateTwin()              (scenario, independent)
       -> compareTwinResults()
  -> { baseline, scenario, comparison, thresholds, estimateNotice }

GET    /api/scenarios                  -> list saved scenarios
GET    /api/scenarios/:id              -> load one owned scenario
POST   /api/scenarios                  -> save a scenario
PATCH  /api/scenarios/:id              -> rename and/or replace inputs
DELETE /api/scenarios/:id              -> delete an owned scenario
POST   /api/scenarios/compare          -> compare two owned saved scenarios
```

All routes use the existing `requireAuth` middleware. `user_id` always comes
from the verified token, never from the request body. Every query is scoped to
both the row id and the verified `user_id`, and the database has RLS enabled.

### Reused code

- `validateNonNegativeNumber`, `validatePositiveNumber`, `validateGoal`, and
  `ceilMonths` from `backend/src/utils/financialAssessment.js`.
- The existing assessment input names (`monthlyIncome`, `monthlyExpenses`,
  `accessibleSavings`, `emiPayments`, `emiIncludedInExpenses`,
  `monthlySavingsCapacity`, `targetAmount`, `currentGoalSavings`,
  `goalTimelineMonths`) so a saved assessment can be used as a baseline
  without translation.
- The existing Supabase route, ownership, error, RLS, and migration patterns.

The only change to the assessment engine is exporting its existing
`ceilMonths` helper. Assessment behaviour is unchanged.

---

## 2. Inputs and validation

### Required baseline/scenario inputs

| Field | Validation |
|---|---|
| `monthlyIncome` | finite number or numeric string, `>= 0` |
| `monthlyExpenses` | finite number or numeric string, `>= 0` |
| `accessibleSavings` | finite number or numeric string, `>= 0` |
| `goal` | non-empty string, normalized through the existing goal aliases |

### Optional inputs

| Field | Default | Validation |
|---|---|---|
| `emiPayments` | `0` | finite number or numeric string, `>= 0` |
| `emiIncludedInExpenses` | `true` | boolean |
| `unexpectedExpense` | `0` | finite number or numeric string, `>= 0`; one-time amount |
| `monthlySavingsCapacity` | `null` | finite number or numeric string, `>= 0` |
| `targetAmount` | `null` | finite number or numeric string, `> 0` when provided |
| `currentGoalSavings` | `0` | finite number or numeric string, `>= 0` |
| `goalTimelineMonths` | `null` | positive whole number when provided |
| `desiredTimelineMonths`, `timelineMonths` | alias | used only when the preferred timeline is missing/blank |
| `asOfDate` | today (UTC) | `YYYY-MM-DD` and a real calendar date |
| `thresholds` | defaults | object with positive numeric threshold overrides |

Negative, non-finite, non-numeric, zero-target, and fractional-timeline values
are rejected with a `400` and a specific message. Invalid values are **never**
silently replaced with zero. Missing optional values use only the documented
defaults above.

---

## 3. Mandatory formulas

All monetary amounts are monthly INR figures unless labelled one-time.

| Metric | Formula / rule |
|---|---|
| Monthly outflows | `O = E + (EMI already included in expenses ? 0 : M)` |
| Monthly surplus | `P = I - O` |
| Savings rate | `P / I × 100`; `null` when `I = 0` |
| Living-expense coverage | `S / E`; `null` when `E = 0` (preserves the existing assessment definition) |
| Mandatory-outflow coverage | `S / O`; `null` when `O = 0` |
| EMI burden | `M / I × 100`; `null` when `I = 0` |
| Post-shock savings | `max(0, S - U)` |
| Unfunded shock | `max(0, U - S)` |
| Remaining goal amount | `max(0, T - C)` |
| Months to goal | `0` if the goal is achieved; otherwise `ceil(remaining / contribution)` when `contribution > 0`; otherwise unreachable (`null`) |
| Required contribution for a requested timeline | `0` if remaining is `0`; otherwise `ceil(remaining / requestedMonths)` |

Where `I` = income, `E` = living expenses, `M` = EMI, `S` = accessible
savings, `U` = unexpected one-time expense, `T` = target amount, and `C` =
current goal savings.

### Precision

Calculations retain full JavaScript number precision. Rounding happens only in
display helpers. Month rounding uses the existing `ceilMonths` helper, which
ignores binary floating-point noise such as `0.07 / 0.01 === 7.000000000000001`.

### No double counting

- EMI is added to outflows at most once: only when
  `emiIncludedInExpenses === false`.
- The unexpected one-time expense is applied once to accessible savings. It is
  not subtracted from monthly surplus or from future goal contributions.
- The goal contribution is used only to estimate the timeline. It is not
  subtracted from monthly surplus a second time.

---

## 4. Goal completion dates

`estimatedCompletionDate` adds the projected number of whole calendar months to
the as-of date and **clamps to the last valid day of the target month**:

- 31 January + 1 month = 28 February (or 29 February in a leap year)
- 31 August + 1 month = 30 September
- 15 January + 2 months = 15 March

A goal that is already achieved has `estimatedMonths = 0` and a completion date
equal to the as-of date. An unreachable goal has `estimatedMonths = null` and no
completion date. The rule is returned in the result as
`goalProjection.completionDateRule`.

---

## 5. Scenario comparison

For every numeric metric:

- Absolute difference: `scenario - baseline`.
- Percentage change: `difference / abs(baseline) × 100`, only when the baseline
  is nonzero and both values are available. Otherwise `null`.
- For rates (`savingsRatePct`, `emiBurdenPct`), a percentage-point difference
  is also returned (`scenario - baseline`).
- If either side is `null`, the difference and percentage change are `null`;
  no value is invented.

Goal comparison additionally includes:

- remaining amount and assumed contribution differences;
- estimated-month difference;
- completion-date direction (`earlier`, `later`, or `same`);
- whether `goalAchieved` or `onTrackForRequestedTimeline` changed.

Recommendation comparison returns:

- `added`: recommendation ids present only in the scenario;
- `resolved`: ids present only in the baseline;
- `unchanged`: ids present in both;
- `severityChanged`: ids whose severity changed.

---

## 6. Recommendation triggers and heuristic thresholds

Thresholds are configurable through the `thresholds` object and are labelled as
heuristics, not universal financial rules.

| Trigger | Rule | Severity |
|---|---|---|
| Deficit | `P < 0` | critical |
| Break-even | `P = 0` | warning |
| Low mandatory-outflow coverage | `S / O < lowMandatoryCoverageMonths` (default `3`) | warning, heuristic |
| High EMI burden | `M / I × 100 > highEmiBurdenPct` (default `40`) | warning, heuristic |
| Unfunded shock | `U > S` | critical |
| Unaffordable goal contribution | `contribution > P` and `contribution > 0` | warning |
| Goal achieved | `C >= T` | positive |

Each recommendation contains `id`, `severity`, `title`, `trigger`, `reason`,
`formula`, `inputs`, `assumptions`, `heuristic`, `threshold`, and
`suggestedAction`. Threshold-based recommendations include the configured value
and a note that the threshold is a heuristic.

Every metric also has an explanation under
`explanations.metrics.<key>` with `label`, `formula`, `inputs`, `assumptions`,
and `reason`. The goal projection has the same structure under
`explanations.goalProjection`.

---

## 7. Persistence

### Migration

Apply `supabase/migrations/20261027100000_financial_scenarios.sql` after the
existing profile, assessment, and goal migrations.

The migration creates `public.financial_scenarios` with:

- `user_id` ownership and RLS select/insert/update/delete policies;
- `baseline_inputs` and `scenario_inputs` JSON objects;
- `thresholds` JSON object;
- `as_of_date` for reproducible completion dates;
- `result` JSON snapshot of the calculated preview;
- optional `baseline_assessment_id` provenance;
- a composite foreign key on `(baseline_assessment_id, user_id)` so a scenario
  can only reference an assessment owned by the same user;
- `updated_at` trigger, owner/date indexes, and authenticated grants.

The composite foreign key uses PostgreSQL's `ON DELETE SET NULL
(baseline_assessment_id)` column-list syntax, available in PostgreSQL 15+.
Supabase projects run PostgreSQL 15 or newer.

### Saved scenario shape

A saved scenario stores the complete normalised baseline inputs, the complete
normalised scenario inputs, the threshold values, the as-of date, and the
calculated preview. Loading or comparing a saved scenario recalculates from the
stored inputs, so display code does not have to trust a stale snapshot.

---

## 8. Frontend

- `frontend/src/pages/DigitalTwinPage.jsx` provides the baseline form,
  what-if adjustments, live debounced recalculation, metric-by-metric
  comparison, goal projection, explainability panels, save/load/rename/delete,
  and saved-scenario comparison.
- `frontend/src/utils/twinDisplay.js` contains display-only formatting helpers.
- `frontend/src/context/UserDataContext.jsx` loads saved scenarios and exposes
  create/update/delete/compare actions.
- `frontend/src/App.jsx` and `frontend/src/components/layout/Sidebar.jsx` add
  the `#twin` tab and navigation item.

The page shows an explicit “Estimate, not prediction” notice and the engine's
disclaimer. It never presents a scenario as an actual outcome.

---

## 9. Tests

- `tests/financialTwin.test.js`: every formula, zero-denominator case,
  EMI inclusion/exclusion, shock funding, goal achieved/unreachable, floating
  point month rounding, month-end dates, threshold boundaries, configurable
  thresholds, comparison semantics, baseline immutability, and validation.
- `tests/scenarioRoutes.test.js`: preview validation, authenticated route
  failures, token-derived ownership, baseline-assessment ownership, list/get,
  rename/update, delete, comparison, 404 ownership behaviour, and malformed ids.
- `tests/protectedRoutes.test.js`: the new routes fail closed when Supabase auth
  is not configured.

Run:

```bash
npm test
npm run build:frontend
```

---

## 10. Remaining limitations

- The Digital Twin is rule-based and deterministic. It does not model
  investment returns, inflation, taxes, interest, income changes, borrowing, or
  asset sales.
- The one-time unexpected expense is treated as a single shock to accessible
  savings. It is not a recurring expense and is not amortised over time.
- Goal projections assume a constant monthly contribution and no returns.
- Thresholds are heuristics, not regulated advice or universal rules.
- `GET /api/scenarios` returns the stored result snapshot for every saved
  scenario, so response size grows with the number of scenarios. Pagination or
  snapshot projection would be a reasonable follow-up if lists become large.
- Hosted Supabase end-to-end verification still requires applying the new
  migration to the hosted project and testing with real accounts.
- Phase 4 has not been started.
