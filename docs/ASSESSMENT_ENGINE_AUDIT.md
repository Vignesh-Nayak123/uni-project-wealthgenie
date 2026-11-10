# WealthGenie Financial Assessment Engine — Phase 2 Audit

**Status:** Complete for the local rule-based engine and its API/persistence mapping.
**Assessment version:** `1.0.0` (unchanged).
**Scope:** `backend/src/utils/financialAssessment.js`, `backend/src/utils/assessmentData.js`,
the assessment routes, the assessment UI, and the existing assessment tests.

This audit did not rebuild the engine, change its response shape, add an ML model, add
dependencies, or touch the Findex experiment, datasets, results, or paper-trading code.

---

## 1. Request and data flow

### Public calculation route

```
POST /api/assessment
  -> backend/src/routes/assessment.routes.js
  -> assessFinances(req.body)
  -> JSON assessment object (200)
  -> 400 { error } for validation failures
```

### Authenticated, persisted route

```
POST /api/assessments
  -> requireAuth (verified Supabase user + token-scoped client)
  -> assessFinances(req.body)
  -> assessmentInsertRow(input, assessment, req.user.id)
  -> public.financial_assessments
  -> mapAssessmentRow(row)
  -> 201 { assessment }

GET  /api/assessments   -> paginated history, newest first
DELETE /api/assessments/:id -> owner-scoped delete
```

### Frontend consumers

- `frontend/src/pages/AssessmentPage.jsx` submits the form through
  `UserDataContext.createAssessment` and renders `assessment.result`.
- `frontend/src/pages/HomePage.jsx` and `MyFinancesPage.jsx` read
  `result.metrics` from the latest saved assessment.
- Saved history is read from `result.metrics` as well.

There is **no numeric risk score or risk band**. The closest thing to a risk
classification is the rule-based `warnings` and `recommendations` arrays. The UI's
20% savings-rate guideline and 6-month emergency-fund target are presentation-only
and are not part of the engine's classification.

---

## 2. Input contract and validation

### Required

| Field | Validation |
|---|---|
| `monthlyIncome` | finite number or numeric string, `>= 0` |
| `monthlyExpenses` | finite number or numeric string, `>= 0` |
| `accessibleSavings` | finite number or numeric string, `>= 0` |
| `goal` | non-empty string, normalized through aliases |

### Optional

| Field | Default | Validation |
|---|---|---|
| `emiPayments` | `0` | finite number or numeric string, `>= 0` |
| `emiIncludedInExpenses` | `true` | boolean |
| `monthlySavingsCapacity` | `null` | finite number or numeric string, `>= 0` |
| `targetAmount` | `null` | finite number or numeric string, `> 0` when provided |
| `currentGoalSavings` | `0` | finite number or numeric string, `>= 0` |
| `goalTimelineMonths` | `null` | positive **whole** number when provided |
| `desiredTimelineMonths` | alias | used when the preferred timeline is missing/blank |
| `timelineMonths` | alias | used when the two fields above are missing/blank |

Validation details:

- `null`, `undefined`, and blank/whitespace-only strings are treated as missing.
- Booleans, objects, arrays, `NaN`, and infinities are rejected as numbers.
- Numeric strings such as `"100000"` are accepted and normalized to numbers.
- Negative amounts are rejected.
- Goal values are lowercased, spaces/hyphens become underscores, then mapped through
  aliases such as `emergency`, `Emergency Fund`, `debt-repayment`, `home`, `house`,
  `child_education`, and `investing`.

---

## 3. Formulas

All amounts are monthly INR figures unless stated otherwise.

### Monthly outflows

```
monthlyOutflows =
  monthlyExpenses + (emiIncludedInExpenses ? 0 : emiPayments)
```

EMI is never double-counted. If it is already inside `monthlyExpenses`, it is not
added again.

### Monthly surplus

```
monthlySurplus = monthlyIncome - monthlyOutflows
```

### Savings rate

```
savingsRatePct =
  monthlyIncome > 0
    ? (monthlySurplus / monthlyIncome) * 100
    : null
```

A zero-income case returns `null` rather than dividing by zero.

### Expense coverage / emergency-fund runway

```
emergencyFundCoverageMonths =
  expenseCoverageMonths =
    monthlyExpenses > 0
      ? accessibleSavings / monthlyExpenses
      : null
```

The two response fields are aliases of the same value. The denominator is monthly
expenses only; see the limitation in section 6.

### Goal projection

Only produced when `targetAmount` is provided.

```
remainingAmount = max(0, targetAmount - currentGoalSavings)

assumedMonthlyContribution =
  monthlySavingsCapacity ?? max(0, monthlySurplus)

estimatedMonths =
  remainingAmount === 0
    ? 0
    : assumedMonthlyContribution > 0
      ? ceilMonths(remainingAmount, assumedMonthlyContribution)
      : null

requiredMonthlyContributionForTimeline =
  goalTimelineMonths !== null
    ? remainingAmount === 0
      ? 0
      : ceilMonths(remainingAmount, goalTimelineMonths)
    : null

onTrackForRequestedTimeline =
  goalTimelineMonths !== null && estimatedMonths !== null
    ? estimatedMonths <= goalTimelineMonths
    : null
```

`ceilMonths` rounds a positive ratio up to a whole month while ignoring binary
floating-point noise. For example, `0.07 / 0.01` evaluates to
`7.000000000000001`; the helper returns `7`, not `8`.

An explicit `monthlySavingsCapacity: 0` is respected as zero. It is not replaced by
the calculated surplus.

**Rounding:** goal months and the required monthly contribution are returned as whole
numbers. Savings rate and expense coverage are returned at full floating-point
precision; the UI formats them to one decimal place.

### Rule-based warnings and recommendations

The engine emits:

- a warning and recommendation for negative surplus;
- a warning and recommendation for zero surplus;
- a warning when income is zero (savings rate unavailable);
- a warning when expenses are zero (coverage unavailable);
- a recommendation when accessible savings are zero;
- a recommendation when coverage is below **3 months**;
- a warning when stated savings capacity exceeds the calculated surplus;
- a recommendation for an emergency-fund goal;
- a recommendation for a debt-repayment goal when EMI is positive;
- a warning when current goal savings exceed the target;
- a recommendation when no target amount was supplied;
- a recommendation when no positive contribution can produce a timeline;
- a recommendation when the estimated timeline exceeds the requested timeline.

---

## 4. Assumptions exposed in the response

- All amounts are monthly INR figures unless stated otherwise.
- EMI is either already inside monthly expenses or added separately, according to
  `emiIncludedInExpenses`.
- Savings rate is monthly surplus divided by monthly income.
- Expense coverage is accessible savings divided by monthly expenses.
- Goal projections use the stated monthly savings capacity when supplied; otherwise
  they assume the full positive monthly surplus is saved each month.
- No investment returns, taxes, inflation, or interest are modelled.
- Contributions are assumed to remain constant.
- The estimate is a mathematical illustration, not a guarantee.
- If no target amount is supplied, no goal timeline is estimated.

---

## 5. Bugs found and fixed

### 5.1 A zero target amount reported “Goal met”

**Before:** `targetAmount: 0` produced `remainingAmount: 0`, `estimatedMonths: 0`,
and no warning. The UI displayed “Goal met” for a ₹0 goal.

**Fix:** A provided target must now be greater than zero. The public and authenticated
routes return `400` with `Goal target amount must be greater than zero when provided.`
The target-amount input now has `min="1"`.

### 5.2 Fractional goal timelines were accepted but stored in an integer column

**Before:** `goalTimelineMonths: 12.5` was accepted. The JSON result contained
`requestedTimelineMonths: 12.5`, while the database column is
`goal_timeline_months integer`, so persistence could round or reject the value.

**Fix:** A provided timeline must now be a whole number. The API returns `400` with
`Goal timeline in months must be a whole number.`

### 5.3 Blank preferred timeline blocked its aliases

**Before:** `goalTimelineMonths: ""` or `"   "` short-circuited the `??` fallback, so
`desiredTimelineMonths` / `timelineMonths` were ignored.

**Fix:** The first non-missing value among the three fields is used, matching the
engine's existing “blank means missing” rule.

### 5.4 Floating-point noise could overstate the goal timeline

**Before:** `0.07 / 0.01` became `7.000000000000001`, and `Math.ceil` returned `8`
months for a mathematically 7-month goal.

**Fix:** Added a relative-tolerance `ceilMonths` helper used for both the estimated
timeline and the required monthly contribution.

### 5.5 An empty-string current-goal-savings fallback reached the database

**Before:** When no target was supplied, `assessmentInsertRow` fell back to the raw
`input.currentGoalSavings`. A value of `""` became `''` in the insert payload instead
of the validated `0`.

**Fix:** The fallback now normalizes missing/blank values to `0` and numeric strings
to numbers before insertion.

---

## 6. Limitations and unresolved risks

1. **No explicit EMI-burden ratio.** EMI affects outflows and surplus, but there is no
   EMI-to-income ratio, debt-service ratio, or EMI-specific risk band.
2. **Coverage excludes separately paid EMI.** `expenseCoverageMonths` and
   `emergencyFundCoverageMonths` use `monthlyExpenses` only. When
   `emiIncludedInExpenses` is `false`, the true runway on total mandatory outflows is
   lower than the reported value. A test now pins this documented behavior so it is
   not changed accidentally.
3. **No investment modelling.** No returns, interest, inflation, taxes, salary growth,
   or changing contribution amounts are included.
4. **No upper bounds.** Amounts and timelines have no engine-level maximum. The
   database uses `numeric(14,2)` and `integer`, so extreme values can still be rejected
   by PostgreSQL even though the engine accepts them.
5. **Currency precision can differ on persistence.** The engine accepts arbitrary
   finite precision, while the database stores `numeric(14,2)`. Sub-paise amounts can
   be rounded in the typed columns even though the full-precision value remains in the
   JSON result.
6. **No numeric risk score.** Consumers must interpret warnings/recommendations
   directly; there is no single “low/medium/high risk” field.
7. **Savings capacity can exceed surplus.** The engine warns about this but still uses
   the stated capacity for the projection, so the projection can be more optimistic
   than the cash-flow surplus.
8. **Goal savings are assumed liquid.** The projection does not model lock-ins,
   penalties, taxes, or the time needed to access `currentGoalSavings`.
9. **Hosted Supabase end-to-end verification is still pending.** The persistence path
   is unit-tested, but the migrations have not been applied to the hosted project in
   this environment.

---

## 7. Arbitrary thresholds

- **Engine:** coverage below **3 months** triggers a recommendation. This is an
  educational heuristic, not a regulatory rule.
- **Frontend only:** the **20%** savings-rate guideline in `MyFinancesPage.jsx` and the
  **6-month** emergency-fund target in `HomePage.jsx`. Neither is produced by the
  assessment engine.

No other numeric thresholds are used by the engine.

---

## 8. Files changed in this phase

| File | Change |
|---|---|
| `backend/src/utils/financialAssessment.js` | Zero-target rejection, whole-month timeline validation, alias fallback, float-noise-safe ceiling |
| `backend/src/utils/assessmentData.js` | Normalize the raw `currentGoalSavings` fallback before insert |
| `frontend/src/pages/AssessmentPage.jsx` | Target-amount input minimum changed from `0` to `1` |
| `tests/financialAssessment.test.js` | Added edge-case and regression tests |
| `tests/assessmentData.test.js` | Added persistence fallback regression test |
| `tests/assessmentApi.test.js` | Added API validation regression tests |
| `docs/ASSESSMENT_ENGINE_AUDIT.md` | This document |

No changes were made to the assessment response shape, the database schema, the
Findex experiment, datasets, results, paper-trading code, or Gemini configuration.

---

## 9. Test results

Commands run from the repository root:

```bash
node --test tests/financialAssessment.test.js tests/assessmentData.test.js tests/assessmentApi.test.js
npm test
npm run build:frontend
```

Results at the time of this audit:

- Targeted assessment suites: **37 passed, 0 failed**
- Full repository suite: **182 passed, 0 failed**
- Frontend production build: **passed**

The full suite includes the pre-existing AMFI/NSE import, investment simulation,
paper-trading, auth, goals, AI lesson, and assessment tests.

---

## 10. Recommended follow-up (not part of Phase 2)

- Decide whether to expose a separate outflow-based emergency runway metric that
  includes separately paid EMI.
- Decide whether to add an EMI-burden ratio and document its threshold.
- Add upper-bound validation aligned with the database column limits if extreme-input
  rejection is desired at the API boundary.
- Apply the Supabase migrations in a hosted environment and run an authenticated
  end-to-end assessment save/read/delete check.
