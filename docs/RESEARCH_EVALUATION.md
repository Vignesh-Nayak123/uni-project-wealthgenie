# WealthGenie Phase 4 - Reproducible Research Evaluation

> **Generated from an actual local execution.** Generated at: 2026-10-27T17:04:06.174Z.
> All profiles in this run are **synthetic**. They are not real people, survey
> respondents, or real-world evidence. This report measures implementation
> consistency and explainability coverage, not real-world predictive accuracy,
> user trust, or financial literacy.

## 1. Research questions

- **RQ1 - Formula correctness:** Do the Digital Twin metrics match independent
  reference calculations across baseline and scenario results?
- **RQ2 - Recommendation consistency:** Do recommendation triggers fire exactly
  according to the documented rules?
- **RQ3 - Comparison and goal correctness:** Does baseline-versus-scenario
  comparison match the reference, and are goal months, dates, and boundaries
  correct?
- **RQ4 - Robustness and reproducibility:** Are deliberately invalid inputs
  rejected, valid inputs accepted, and repeated runs deterministic?
- **RQ5 - Directional usefulness:** Do controlled one-input changes satisfy the
  documented directional invariants?
- **RQ6 - Explainability coverage:** Do displayed metrics, goal fields, and
  recommendations include the required formula/rule, inputs, reason,
  assumptions, and heuristic distinction where applicable?

## 2. What was evaluated and what was not

**Evaluated:** the pure deterministic utilities in
`backend/src/utils/financialTwin.js` - `calculateTwin`, `buildTwinPreview`,
`compareTwinResults`, input validation, goal projection, recommendation rules,
and explanation payloads - using an independent reference implementation in
`experiments/lib/reference.js`.

**Not evaluated:** real-world predictive accuracy, investment returns, user
trust, comprehension, financial literacy, the hosted Supabase deployment, or
the Global Findex experiment. No user study was conducted. No ML model was
trained or changed. The Findex dataset, preprocessing, models, and results were
not modified.

## 3. Environment

| Item | Value |
| --- | --- |
| Node.js | v22.16.0 |
| npm | 10.9.2 |
| Platform | win32 |
| Architecture | x64 |
| OS release | 10.0.26300 |
| Experiment dependencies | none beyond the repository runtime |
| root package | 0.1.0 |
| backend package | 0.1.0 |
| frontend package | 1.0.0 |

## 4. Reproducibility parameters

| Parameter | Value |
| --- | --- |
| Experiment version | 1.0.0 |
| Dataset schema version | 1.0.0 |
| Random seed | 20261027 |
| Requested random profiles | 200 |
| Include deterministic edge cases | true |
| Default as-of date | 2026-10-27 |
| Low mandatory-outflow coverage threshold | 3 |
| High EMI burden threshold (%) | 40 |
| Synthetic only | true |
| Real data used | false |

### Dataset and scenario counts

| Count | Value |
| --- | --- |
| Requested random profiles | 200 |
| Random profiles generated | 200 |
| Deterministic edge-case profiles | 26 |
| Total profiles | 226 |
| Baseline results evaluated | 226 |
| Scenario results evaluated | 1416 |
| Total results evaluated | 1642 |
| Results with a goal target | 480 |
| Results without a goal target | 1162 |
| Results with goal achieved | 128 |
| Results with unreachable goal | 105 |
| Month-end as-of results with positive months | 16 |
| Floating-point boundary results | 8 |

### Profiles by archetype

| Archetype | Profiles |
| --- | --- |
| break_even | 1 |
| coverage_boundary | 2 |
| deficit | 1 |
| emi_boundary | 2 |
| emi_included | 15 |
| emi_separate | 16 |
| float_noise | 1 |
| goal_achievable | 14 |
| goal_achieved | 16 |
| goal_unreachable | 15 |
| high_emergency_savings | 14 |
| large_values | 1 |
| low_emergency_savings | 14 |
| month_end | 2 |
| negative_surplus | 15 |
| no_goal | 1 |
| positive_surplus | 15 |
| shock_funded | 15 |
| shock_unfunded | 15 |
| timeline | 2 |
| tiny_goal | 1 |
| zero_everything | 1 |
| zero_expenses | 15 |
| zero_income | 15 |
| zero_outflows | 1 |
| zero_savings | 1 |
| zero_surplus | 15 |

### Scenario cases by name

| Scenario | Cases |
| --- | --- |
| combined_stress | 226 |
| emi_up | 226 |
| expenses_up | 226 |
| goal_contribution_up | 60 |
| income_up | 226 |
| savings_up | 226 |
| shock | 226 |

## 5. Dataset schema

Every profile is generated locally from the seeded PRNG and the documented
archetypes. Edge cases are always included unless `includeEdgeCases` is false.
The synthetic dataset is stored separately from `data/processed/findex_resilience.csv`
and is never merged with it.

| Field | Type | Description |
| --- | --- | --- |
| id | string | Stable synthetic profile identifier. |
| source | string | Always "synthetic". |
| archetype | string | Generating archetype or edge-case label. |
| note | string | Human-readable description; not evidence. |
| asOfDate | YYYY-MM-DD | Fixed projection date for this profile. |
| monthlyIncome | number >= 0 | Monthly income in INR. |
| monthlyExpenses | number >= 0 | Monthly living expenses in INR. |
| accessibleSavings | number >= 0 | Accessible savings in INR. |
| goal | enum string | Validated goal category. |
| emiPayments | number >= 0 | Monthly EMI payments in INR. |
| emiIncludedInExpenses | boolean | Whether EMI is already inside expenses. |
| unexpectedExpense | number >= 0 | One-time shock in INR. |
| monthlySavingsCapacity | number >= 0 \| null | Optional explicit goal contribution. |
| targetAmount | number > 0 \| null | Optional goal target. |
| currentGoalSavings | number >= 0 | Amount already saved for the goal. |
| goalTimelineMonths | integer > 0 \| null | Optional requested timeline. |

## 6. Metric definitions, formulas, and denominators

| Measure | Definition / formula | Denominator | Limitation |
| --- | --- | --- | --- |
| Formula correctness | One assertion per core metric: engine value equals independent reference value. Core metrics: monthlyIncome, monthlyExpenses, accessibleSavings, emiPayments, emiIncludedInExpenses, unexpectedExpense, monthlyOutflows, monthlySurplus, savingsRatePct, livingExpenseCoverageMonths, mandatoryOutflowCoverageMonths, emiBurdenPct, postShockSavings, unfundedShock. | 14 x 1642 = 22988 assertions | The reference is a second implementation by the same project, not an external oracle. |
| Alias correctness | `expenseCoverageMonths` equals `livingExpenseCoverageMonths`. | 1642 results | Compatibility alias only. |
| Goal correctness | One assertion per goal field: targetAmount, currentGoalSavings, remainingAmount, assumedMonthlyContribution, estimatedMonths, unreachable, requestedTimelineMonths, requiredMonthlyContributionForTimeline, onTrackForRequestedTimeline, goalAchieved, estimatedCompletionDate. | 11 x 1642 = 18062 assertions | Assumes constant contributions and no returns. |
| Goal context | The engine uses the fixed as-of date for both the result and the goal projection. | 1642 results | Does not validate time-zone behaviour beyond the fixed date. |
| Recommendation exact-set agreement | Engine recommendation ID set equals the reference rule set. | 1642 results | A set match does not prove the recommendation is financially optimal. |
| Recommendation per-decision agreement | For each of 7 recommendation IDs, expected presence equals actual presence. | 7 x 1642 = 11494 decisions | Rare triggers can have high agreement but low positive predictive value. |
| Recommendation severity | Displayed severity equals the documented severity for that ID. | 1643 displayed recommendations | Severity is a fixed mapping, not a calibrated risk score. |
| Comparison metric correctness | For each of 13 comparison metrics, baseline, scenario, difference, percentage change, and percentage-point difference match the reference. | 13 x 5 x 1416 = 92040 assertions | Percentage change is undefined when the baseline is zero. |
| Goal comparison correctness | Goal comparison fields match the reference, including completion-date direction. | 49560 assertions | Direction is based on projected months, not calendar-day differences. |
| Comparison recommendation diff | Added, resolved, unchanged, and severity-changed sets match the reference. | 4 x 1416 = 5664 assertions | Only IDs and severity are compared. |
| Baseline consistency in preview | `buildTwinPreview.baseline` equals a separately calculated baseline. | 1416 scenarios | Catches preview/baseline drift, not formula errors already covered above. |
| Comparison overall | Union of the four comparison families above. | 148680 assertions | The overall rate includes metric, goal, recommendation-diff, and baseline-consistency checks. |
| Determinism | Repeated calls with identical inputs produce identical serialized results. | 1642 repeated cases (226 baseline + 1416 scenario) | Same-process determinism only; not cross-version. |
| Validation rejection | Deliberately invalid inputs are rejected with a matching, non-empty message. | 31 invalid cases | A finite adversarial suite, not a proof of security. |
| Validation acceptance | Deliberately valid inputs are accepted. | 5 valid cases | Guards against over-rejection only. |
| Directional invariants | Seven controlled one-input changes satisfy their documented direction. | 1172 applicable checks (410 N/A) | Mathematical properties of the model, not evidence of real-world improvement. |
| Explainability coverage | Applicable displayed metrics, goal fields, and recommendations contain the required explanation fields. | 261857 applicable checks | Presence/consistency, not user comprehension or trust. |

## 7. Results

### 7.1 Overall assertion results

| Measure | Passed / total | Rate |
| --- | --- | --- |
| Formula correctness | 22988/22988 (100.00%) | 100.00% |
| Formula alias | 1642/1642 (100.00%) | 100.00% |
| Goal correctness | 18062/18062 (100.00%) | 100.00% |
| Goal context | 1642/1642 (100.00%) | 100.00% |
| Recommendation exact set | 1642/1642 (100.00%) | 100.00% |
| Recommendation decisions | 11494/11494 (100.00%) | 100.00% |
| Recommendation severity | 1643/1643 (100.00%) | 100.00% |
| Comparison correctness | 148680/148680 (100.00%) | 100.00% |
| Determinism | 1642/1642 (100.00%) | 100.00% |
| Validation (invalid) | 31/31 | 100.00% |
| Validation (valid) | 5/5 | 100.00% |
| Directional invariants | 1172/1172 (100.00%) | 100.00% |
| Explainability coverage | 261857/261857 (100.00%) | 100.00% |

### 7.2 Formula correctness by metric

| Metric | Baseline | Scenario | Overall | Max abs error | Mean abs error | Null mismatches |
| --- | --- | --- | --- | --- | --- | --- |
| monthlyIncome | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| monthlyExpenses | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| accessibleSavings | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| emiPayments | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| emiIncludedInExpenses | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | - | 0 |
| unexpectedExpense | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| monthlyOutflows | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| monthlySurplus | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| savingsRatePct | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| livingExpenseCoverageMonths | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| mandatoryOutflowCoverageMonths | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| emiBurdenPct | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| postShockSavings | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |
| unfundedShock | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 | 0 |

### 7.3 Goal projection correctness by field

| Field | Baseline | Scenario | Overall | Max abs error | Mean abs error |
| --- | --- | --- | --- | --- | --- |
| targetAmount | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 |
| currentGoalSavings | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 |
| remainingAmount | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 |
| assumedMonthlyContribution | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 |
| estimatedMonths | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 |
| unreachable | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | - |
| requestedTimelineMonths | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 |
| requiredMonthlyContributionForTimeline | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | 0 |
| onTrackForRequestedTimeline | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | - |
| goalAchieved | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | - |
| estimatedCompletionDate | 226/226 (100.00%) | 1416/1416 (100.00%) | 1642/1642 (100.00%) | 0 | - |

### 7.4 Recommendation trigger agreement

**Exact-set agreement:** 1642/1642 (100.00%).
**Per-decision agreement:** 11494/11494 (100.00%).

| Recommendation ID | Expected present | Actual present | TP | FP | FN | Precision | Recall | Agreement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deficit | 345 | 345 | 345 | 0 | 0 | 1 | 1 | 100.00% |
| break_even | 73 | 73 | 73 | 0 | 0 | 1 | 1 | 100.00% |
| low_mandatory_coverage | 761 | 761 | 761 | 0 | 0 | 1 | 1 | 100.00% |
| high_emi_burden | 11 | 11 | 11 | 0 | 0 | 1 | 1 | 100.00% |
| unfunded_shock | 306 | 306 | 306 | 0 | 0 | 1 | 1 | 100.00% |
| unaffordable_goal_contribution | 19 | 19 | 19 | 0 | 0 | 1 | 1 | 100.00% |
| goal_achieved | 128 | 128 | 128 | 0 | 0 | 1 | 1 | 100.00% |

### 7.5 Scenario comparison correctness

**Overall comparison:** 148680/148680 (100.00%).

| Comparison metric | Passed / total | Failures |
| --- | --- | --- |
| monthlyIncome | 7080/7080 (100.00%) | 0 |
| monthlyExpenses | 7080/7080 (100.00%) | 0 |
| monthlyOutflows | 7080/7080 (100.00%) | 0 |
| monthlySurplus | 7080/7080 (100.00%) | 0 |
| savingsRatePct | 7080/7080 (100.00%) | 0 |
| accessibleSavings | 7080/7080 (100.00%) | 0 |
| unexpectedExpense | 7080/7080 (100.00%) | 0 |
| postShockSavings | 7080/7080 (100.00%) | 0 |
| unfundedShock | 7080/7080 (100.00%) | 0 |
| livingExpenseCoverageMonths | 7080/7080 (100.00%) | 0 |
| mandatoryOutflowCoverageMonths | 7080/7080 (100.00%) | 0 |
| emiPayments | 7080/7080 (100.00%) | 0 |
| emiBurdenPct | 7080/7080 (100.00%) | 0 |

**Goal comparison:** 49560/49560 (100.00%).

| Goal comparison field | Passed / total | Failures |
| --- | --- | --- |
| targetAmount | 7080/7080 (100.00%) | 0 |
| currentGoalSavings | 7080/7080 (100.00%) | 0 |
| remainingAmount | 7080/7080 (100.00%) | 0 |
| assumedMonthlyContribution | 7080/7080 (100.00%) | 0 |
| estimatedMonths | 7080/7080 (100.00%) | 0 |
| completionDate | 5664/5664 (100.00%) | 0 |
| goalAchieved | 4248/4248 (100.00%) | 0 |
| onTrackForRequestedTimeline | 4248/4248 (100.00%) | 0 |

**Recommendation diff:** 5664/5664 (100.00%).
**Preview baseline consistency:** 1416/1416 (100.00%).

### 7.6 Input validation and boundary robustness

| Measure | Value |
| --- | --- |
| Invalid cases rejected | 31/31 (100.00%) |
| Invalid cases with matching message | 31/31 (100.00%) |
| Invalid cases fully passing | 31/31 (100.00%) |
| Valid cases accepted | 5/5 (100.00%) |

Selected boundary checks from this run:

| Boundary | Case | Field/decision | Actual result |
| --- | --- | --- | --- |
| Floating-point goal months | syn-edge-goal-float-noise | estimatedMonths | 7 (expected 7; pass) |
| Month-end clamp (leap February) | syn-edge-month-end-feb | estimatedCompletionDate | 2024-02-29 (expected 2024-02-29; pass) |
| Month-end clamp (30-day month) | syn-edge-month-end-sep | estimatedCompletionDate | 2026-09-30 (expected 2026-09-30; pass) |
| Zero income denominator | syn-edge-zero-income | savingsRatePct | - (expected -; pass) |
| Zero expenses denominator | syn-edge-zero-expenses | livingExpenseCoverageMonths | - (expected -; pass) |
| Zero outflows denominator | syn-edge-zero-outflows-emi-included | mandatoryOutflowCoverageMonths | - (expected -; pass) |
| Coverage exactly at threshold | syn-edge-coverage-exactly-3 | low_mandatory_coverage | false (expected false; pass) |
| Coverage just below threshold | syn-edge-coverage-below-3 | low_mandatory_coverage | true (expected true; pass) |
| EMI exactly at threshold | syn-edge-emi-exactly-40 | high_emi_burden | false (expected false; pass) |
| EMI just above threshold | syn-edge-emi-above-40 | high_emi_burden | true (expected true; pass) |

### 7.7 Determinism

| Scope | Passed / total | Rate |
| --- | --- | --- |
| Baseline repeats | 226/226 (100.00%) | 100.00% |
| Scenario repeats | 1416/1416 (100.00%) | 100.00% |
| Overall | 1642/1642 (100.00%) | 100.00% |

### 7.8 Directional invariants

These checks hold under the stated assumptions: one input changes at a time by a
non-negative amount, all other inputs and the fixed as-of date stay constant,
and no display rounding is applied. They are mathematical properties of the
implemented model, not evidence of real-world financial improvement.

| Invariant | Applicable | Passed | Failed | N/A | Rate | Assumption |
| --- | --- | --- | --- | --- | --- | --- |
| income_up_surplus_non_decreasing | 226 | 226 | 0 | 0 | 100.00% | Delta is non-negative and no other input changes. |
| expenses_up_surplus_non_increasing | 226 | 226 | 0 | 0 | 100.00% | Delta is non-negative. When EMI is included in expenses, expenses remain the outflow base. |
| savings_up_coverage_non_decreasing | 208 | 208 | 0 | 18 | 100.00% | Applies only when monthly living expenses are positive; coverage is undefined when E = 0. |
| shock_up_post_shock_non_increasing | 226 | 226 | 0 | 0 | 100.00% | The shock is applied once to accessible savings and never to monthly surplus. |
| contribution_up_months_non_increasing | 60 | 60 | 0 | 166 | 100.00% | Applies only when a target amount is set. An unreachable goal (no positive contribution) is treated as infinite months. |
| emi_included_up_surplus_unchanged | 208 | 208 | 0 | 18 | 100.00% | Applies only when emiIncludedInExpenses is true, because EMI is already inside E. |
| emi_separate_up_surplus_non_increasing | 18 | 18 | 0 | 208 | 100.00% | Applies only when emiIncludedInExpenses is false, because EMI is then added to O. |

### 7.9 Explainability coverage

**Overall explainability coverage:** 261857/261857 (100.00%).

| Category | Overall | Baseline | Scenario |
| --- | --- | --- | --- |
| result | 9852/9852 (100.00%) | 1356/1356 (100.00%) | 8496/8496 (100.00%) |
| metric | 123150/123150 (100.00%) | 16950/16950 (100.00%) | 106200/106200 (100.00%) |
| goal | 8210/8210 (100.00%) | 1130/1130 (100.00%) | 7080/7080 (100.00%) |
| goal_metric | 90310/90310 (100.00%) | 12430/12430 (100.00%) | 77880/77880 (100.00%) |
| recommendation | 15557/15557 (100.00%) | 1921/1921 (100.00%) | 13636/13636 (100.00%) |
| formula_accuracy | 14778/14778 (100.00%) | 2034/2034 (100.00%) | 12744/12744 (100.00%) |

The denominator counts only checks applicable to the displayed result. For
example, a recommendation check is counted only when that recommendation is
displayed. Empty assumption arrays are accepted as "no additional assumption
stated"; this checklist verifies presence and consistency, not the quality or
persuasiveness of the wording. Per-check coverage for every check is exported
in `explainability-summary.csv`; failed checks are exported in
`explainability-failures.csv`.

### 7.10 Failed cases and error analysis

| Category | Failures |
| --- | --- |
| formula | 0 |
| formulaAlias | 0 |
| goal | 0 |
| goalContext | 0 |
| recommendation | 0 |
| comparison | 0 |
| determinism | 0 |
| validation | 0 |
| invariants | 0 |
| explainability | 0 |
| total | 0 |
| stored examples | 0 |

No failed assertions were recorded in this run.

## 8. Interpretation

- **Formula, goal, comparison, recommendation, validation, determinism, and
  invariant rates measure implementation consistency.** They do not measure
  whether the recommendations improve a real person's finances.
- **Explainability coverage measures the presence and internal consistency of
  explanatory fields.** It does not show that explanations improve trust,
  comprehension, or financial literacy; that requires a separate user study.
- **Directional invariants are model properties.** They show that the calculator
  moves in the documented direction under controlled changes, not that a real
  user would experience those outcomes.
- **Synthetic profiles are not evidence.** The dataset is a deterministic test
  fixture. Its distributions are documented but not representative of any
  population.
- **The Findex experiment is isolated and unchanged.** It is a survey-response
  classifier with coarse features, not an individual financial-health predictor,
  and it is not used by the application. No Findex data, model, or result was
  modified or merged with these synthetic profiles.

## 9. Limitations and threats to validity

1. **Reference-implementation bias.** The independent reference is a second
   implementation by the same project. Agreement reduces the chance of a
   transcription bug but does not provide an external mathematical oracle.
2. **Synthetic-data validity.** Archetypes and edge cases are hand-designed.
   They cover the required boundaries but are not a probability sample of any
   real population.
3. **Finite scenario suite.** The suite changes one input at a time, plus one
   combined-stress case. It does not explore all interaction effects or
   arbitrary parameter combinations.
4. **Model scope.** The engine does not model investment returns, interest,
   inflation, taxes, future income changes, borrowing, or asset sales.
5. **No user study.** Explainability coverage is not evidence of improved trust,
   comprehension, or financial literacy.
6. **Floating-point tolerance.** Numeric equality uses a relative tolerance of
   `1e-9`; this is appropriate for the tested formulas but would hide errors
   smaller than that tolerance.
7. **Single environment.** Determinism is measured in one Node.js process on one
   platform. Cross-version or cross-platform reproducibility is not proven here.
8. **Hosted Supabase not verified.** Phase 4 runs locally with pure calculation
   utilities and does not require hosted credentials. The Phase 3 migration's
   hosted verification remains pending.
9. **No predictive-accuracy claim.** There is no outcome dataset linking these
   inputs to future financial resilience, so no predictive accuracy is reported.

## 10. Reproduction

From the repository root:

```bash
npm install
npm test
npm run experiment
npm run build:frontend
```

To regenerate this report into `docs/RESEARCH_EVALUATION.md`:

```bash
npm run experiment:publish
```

`npm run experiment` uses the fixed seed and profile count recorded above. To
override them explicitly in bash, cmd, or Git Bash:

```bash
npm run experiment -- --seed 20261027 --profiles 200
```

The dedicated `experiment:publish` script avoids shell-specific argument
forwarding issues (for example, Windows PowerShell can drop forwarded flags).
The equivalent direct command is `node experiments/run.js --publish-doc`.

The default command uses the fixed seed and fixed as-of date recorded above.
Every run writes to a new timestamped directory under `experiments/results/`
and never overwrites an earlier run. To reproduce exactly, keep the seed,
profile count, edge-case flag, as-of date, thresholds, and Node.js version
unchanged.

Run directory for this report: `experiments/results/run-20261027T170406Z-seed-20261027`.

## Appendix - Artifact inventory

| File | Contents |
| --- | --- |
| run.json | Summary, config, environment metadata, failures |
| dataset.json | Exact generated profiles and dataset metadata |
| profiles.csv | Machine-readable experiment rows |
| scenario-cases.csv | Machine-readable experiment rows |
| metric-results.csv | Machine-readable experiment rows |
| goal-results.csv | Machine-readable experiment rows |
| comparison-results.csv | Machine-readable experiment rows |
| recommendation-results.csv | Machine-readable experiment rows |
| validation-results.csv | Machine-readable experiment rows |
| invariants.csv | Machine-readable experiment rows |
| explainability-summary.csv | Machine-readable experiment rows |
| explainability-failures.csv | Machine-readable experiment rows |
| failures.csv | Machine-readable experiment rows |
| report.md | This report |
| manifest.json | SHA-256 checksums and sizes for every artifact |
