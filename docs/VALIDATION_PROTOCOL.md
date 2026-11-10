# Validation Protocol — Phase 5

**Status:** Design only. No new data were collected. **No external expert review
was performed. No user study was performed. No field or longitudinal study was
performed.** Phase 4 results are implementation-consistency evidence, not
independent external validation.

> **Scope.** This protocol defines how to test WealthGenie's deterministic
> assessment and Financial Digital Twin, how to distinguish software-testable
> questions from questions that require expert judgement or human participants,
> and how to revise claims so that they match the available evidence. It does
> not add product features, change Phase 4 results, modify Findex data or
> models, or start Phase 6.

---

## 1. Purpose

Phase 4 answered a narrow question: does the engine agree with a separately
implemented reference on synthetic profiles, and does it emit the required
explanation fields? That is necessary but not sufficient.

Phase 5 defines a broader validation agenda:

1. **Correctness:** are the calculations right, including edge cases and
   boundaries?
2. **Reproducibility:** can the results be reproduced from recorded inputs?
3. **Transparency:** are formulas, inputs, assumptions, and thresholds exposed
   and traceable?
4. **Consistency:** do controlled changes move the indicators in the documented
   direction?
5. **Decision support:** does interactive scenario simulation add value over a
   static assessment?
6. **Content validity:** are the formulas, assumptions, and thresholds
   appropriate according to independent experts?
7. **User comprehension:** can beginners understand and use the output?
8. **Outcomes:** does use improve financial behaviour, resilience, or well-being
   in the real world?

The protocol separates these questions because they require different evidence.

---

## 2. Research questions and evidence types

### 2.1 RQ table

| ID | Research question | Primary evidence | Answerable by existing software tests? | Expert assessment needed? | Human participants needed? | Current status |
| --- | --- | --- | --- | --- | --- | --- |
| RQ1 | Do the metrics match independently derived expected outcomes across baseline and scenario cases? | Hand-derived reference suite; unit and property tests | Yes, partially | Optional for formula plausibility | No | Phase 4 reference implementation passed; Phase 5 hand-derived suite designed, not executed |
| RQ2 | Are results deterministic and reproducible across repeated runs and environments? | Fixed seed/date/thresholds; repeated runs; manifest checksums; second environment | Yes | No | No | Same-process determinism verified in Phase 4; cross-environment not verified |
| RQ3 | Does every metric and recommendation expose its formula, inputs, assumptions, trigger, and threshold? | Structural tests; expert review of adequacy; user comprehension study | Partially: presence and internal consistency only | Yes, for adequacy | Yes, for comprehension | Phase 4 coverage measured; no expert or user review |
| RQ4 | Do controlled one-input changes move the indicators and recommendations in the documented direction? | Directional invariants; boundary cases; expert review of plausibility | Yes, for mathematical properties | Yes, for financial plausibility | No | Phase 4 invariants passed; no expert review |
| RQ5 | Do recommendation triggers fire exactly at and around thresholds? | Boundary cases in the reference suite; configurable-threshold tests | Yes | Yes, for threshold appropriateness | No | Phase 4 boundary tests passed; Phase 5 cases designed |
| RQ6 | Do explanations match the actual calculation and inputs? | Structural and formula-token tests; manual audit | Yes | Yes, for clarity and accuracy | Yes, for comprehension | Phase 4 coverage measured; no expert or user review |
| RQ7 | Does B (assessment + Digital Twin) add decision-support value over A (static assessment)? | Randomized user study with matched tasks | No | Yes, for task and rubric design | Yes | Not studied |
| RQ8 | Does use improve financial behaviour, resilience, or well-being? | Longitudinal or randomized field study with validated measures | No | Yes, for design and measures | Yes | Not studied; no claim made |
| RQ9 | Is B usable, understandable, and appropriately trusted? | Usability and comprehension study; trust calibration | No | Yes, for materials | Yes | Not studied |
| RQ10 | Do results and comprehension hold across income, gender, education, region, and language? | Stratified user study; subgroup analysis | Partially: synthetic strata only | Yes, for sampling and interpretation | Yes | Not studied |

### 2.2 What software tests can and cannot answer

**Software tests can answer:**

- whether the code implements the documented formula;
- whether a trigger fires at the documented boundary;
- whether a null denominator produces null rather than zero or infinity;
- whether a completion date is clamped correctly;
- whether a scenario comparison uses the documented difference and percentage
  rules;
- whether explanation fields are present and internally consistent;
- whether repeated runs produce identical output.

**Software tests cannot answer:**

- whether the formula is the right formula for a household;
- whether a 3-month or 40% threshold is appropriate;
- whether a recommendation is helpful, harmful, or confusing;
- whether a user understands the explanation;
- whether the tool improves decisions, trust, literacy, resilience, or
  well-being;
- whether the results generalize to a population.

This distinction is the backbone of the protocol.

---

## 3. Evidence hierarchy

| Level | Evidence type | What it establishes | Phase 5 status |
| --- | --- | --- | --- |
| 0 | Code inspection and documentation | The implementation matches the written specification | Available |
| 1 | Unit, integration, and route tests | The implementation behaves as tested in one environment | Phase 4 complete |
| 2 | Independent reference suite with hand-derived expected outcomes | Agreement with separately derived calculations, including boundaries | Designed here; not executed |
| 3 | Expert review | Content validity: formulas, assumptions, thresholds, explanations, harm | Protocol designed; not performed |
| 4 | User study | Comprehension, usability, trust calibration, decision support | Protocol designed; not performed |
| 5 | Field, longitudinal, or randomized study | Real-world behaviour and outcomes | Not designed as an executed study; future plan only |

Phase 4 is Level 1 plus a same-project Level 2 reference implementation. It is
not Level 3, 4, or 5. The Phase 5 hand-derived suite is intended to strengthen
Level 2, but it is still not an external oracle.

---

## 4. Independent reference suite

### 4.1 Purpose

The suite provides a set of cases whose expected outcomes are derived **without
running the engine**. It is designed to catch:

- transcription errors in formulas;
- boundary errors at thresholds;
- null-handling errors;
- double-counting of EMI or shocks;
- month-end and leap-year errors;
- floating-point rounding errors;
- comparison and explanation inconsistencies.

It is not designed to prove that the formulas are financially optimal.

### 4.2 Independence principles

1. **Separate derivation.** Expected values are calculated by hand, in a
   spreadsheet, or by a separate implementation written by someone who has not
   read the engine code. The engine must not be used to generate expected values.
2. **No shared constants.** Default thresholds and formulas are restated in the
   case file from the specification, not imported from the engine.
3. **Freeze before execution.** Expected values are committed and checksummed
   before the suite is run against the engine. They are not adjusted to fit the
   engine's output.
4. **Null is a value.** Expected `null` must match actual `null`; a numeric zero
   is not an acceptable substitute.
5. **Full precision.** Expected numeric values retain full precision; rounding
   is a display concern. Comparison uses exact equality for integers, booleans,
   strings, and dates, and relative tolerance `1e-9` for floating-point numbers.
6. **Adjudication.** Any disagreement is recalculated manually and recorded with
   a rationale. If the expected value was wrong, the case is corrected and the
   correction is documented; if the engine was wrong, the case is a failure.
7. **Versioning.** Cases and expected values have a version. A change requires a
   documented reason and a new checksum.
8. **No cherry-picking.** All cases are reported, including failures.

### 4.3 Coverage matrix

| Category | Cases | What is tested | Example |
| --- | --- | --- | --- |
| Income and expense edges | Zero income, zero expenses, zero outflows, break-even, deficit, fractional values | Null denominators, sign of surplus, savings rate | A1, A2, A3 |
| EMI inclusion/exclusion | EMI included, EMI separate, zero EMI, EMI at and above 40% | No double counting; burden calculation; coverage | A4, A5 |
| Emergency-fund coverage | Zero savings, exactly 3 months, just below 3 months, zero expenses, zero outflows | Coverage ratio and threshold boundary | A2, A6, A10, A12 |
| Shocks | Zero shock, fully funded, exactly funded, unfunded by 1, shock greater than savings | Post-shock savings; unfunded shock; recommendation trigger | A1, A7 |
| Goal projections | No target, achieved, above target, unreachable, zero contribution, explicit contribution, timeline met/missed | Remaining amount, contribution, months, required contribution, on-track flag | A8, A9, A16, A17 |
| Dates | Month-end, leap February, 30-day month, mid-month | Calendar clamping | A10 |
| Floating point | Tiny target and contribution | Month ceiling without binary noise | A11 |
| Recommendation thresholds | Each of 7 triggers; exact boundary; just inside/outside; overrides; multiple triggers; severity | Trigger set and severity | A1, A3, A5–A9, A13 |
| Scenario comparison | Positive and negative changes, zero baseline, null propagation, goal direction, recommendation diff | Difference, percentage change, percentage points, null handling | A12, A12b |
| Explanation correctness | Every metric and recommendation | Formula, inputs, reason, assumptions, heuristic threshold | A14 |
| Validation | Negative, NaN, infinity, non-numeric, boolean, blank, missing, zero target, fractional timeline, invalid date, invalid threshold | Rejection and message quality | A15 |

### 4.4 Worked cases

**Notation.** `I` = monthly income; `E` = living expenses; `S` = accessible
savings; `M` = EMI; `inc` = EMI already included in expenses (`true`/`false`);
`U` = one-time unexpected expense; `T` = target amount; `C` = current goal
savings; `L` = requested timeline in months; `K` = explicit monthly savings
capacity (null means use surplus). All amounts are INR. `Req` =
`requiredMonthlyContributionForTimeline`. `EM` = `estimatedMonths`. `PS` =
post-shock savings. `US` = unfunded shock. `LC` = living-expense coverage. `MC`
= mandatory-outflow coverage. `EB` = EMI burden percent. `SR` = savings rate
percent. `Recs` = expected recommendation IDs with severity.

The full expected record for each case includes all 14 core metrics, all 11
computed goal fields, the recommendation set, and explanation checks. The table
below shows the discriminating values.

| ID | Purpose | Inputs | Expected core values | Expected goal values | Expected recommendations |
| --- | --- | --- | --- | --- | --- |
| A1 | Zero income, deficit | I=0; E=20,000; S=50,000; M=0; inc=true; U=0; T=100,000; C=0; L=12; K=null | O=20,000; P=-20,000; SR=null; LC=2.5; MC=2.5; EB=null; PS=50,000; US=0 | Rem=100,000; Contrib=0; EM=null; Req=8,334; OnTrack=null; GA=false | deficit (critical); low_mandatory_coverage (warning) |
| A2 | Zero expenses | I=50,000; E=0; S=100,000; M=0; inc=true; U=0; T=200,000; C=0; L=10; K=null | O=0; P=50,000; SR=100; LC=null; MC=null; EB=0; PS=100,000; US=0 | Rem=200,000; Contrib=50,000; EM=4; Req=20,000; OnTrack=true; GA=false | none |
| A3 | Break-even with separate EMI | I=60,000; E=40,000; S=90,000; M=20,000; inc=false; U=0; T=120,000; C=0; L=12; K=null | O=60,000; P=0; SR=0; LC=2.25; MC=1.5; EB=33.3333; PS=90,000; US=0 | Rem=120,000; Contrib=0; EM=null; Req=10,000; OnTrack=null; GA=false | break_even (warning); low_mandatory_coverage (warning) |
| A4a | EMI included in expenses | I=100,000; E=50,000; S=200,000; M=15,000; inc=true; U=0; T=300,000; C=50,000; L=24; K=null | O=50,000; P=50,000; SR=50; LC=4; MC=4; EB=15; PS=200,000; US=0 | Rem=250,000; Contrib=50,000; EM=5; Req=10,417; OnTrack=true; GA=false | none |
| A4b | Same EMI paid separately | I=100,000; E=50,000; S=200,000; M=15,000; inc=false; U=0; T=300,000; C=50,000; L=24; K=null | O=65,000; P=35,000; SR=35; LC=4; MC=3.076923; EB=15; PS=200,000; US=0 | Rem=250,000; Contrib=35,000; EM=8; Req=10,417; OnTrack=true; GA=false | none |
| A5a | EMI exactly 40% | I=100,000; E=30,000; S=150,000; M=40,000; inc=false; U=0; T=100,000; C=0; L=12; K=null | O=70,000; P=30,000; SR=30; LC=5; MC=2.142857; EB=40; PS=150,000; US=0 | Rem=100,000; Contrib=30,000; EM=4; Req=8,334; OnTrack=true; GA=false | low_mandatory_coverage only |
| A5b | EMI just above 40% | I=100,000; E=30,000; S=150,000; M=40,001; inc=false; U=0; T=100,000; C=0; L=12; K=null | O=70,001; P=29,999; SR=29.999; LC=5; MC=2.142827; EB=40.001; PS=150,000; US=0 | Rem=100,000; Contrib=29,999; EM=4; Req=8,334; OnTrack=true; GA=false | low_mandatory_coverage; high_emi_burden |
| A6a | Coverage exactly 3 months | I=80,000; E=40,000; S=120,000; M=0; inc=true; U=0; T=500,000; C=0; L=24; K=null | O=40,000; P=40,000; SR=50; LC=3; MC=3; EB=0; PS=120,000; US=0 | Rem=500,000; Contrib=40,000; EM=13; Req=20,834; OnTrack=true; GA=false | none |
| A6b | Coverage just below 3 months | I=80,000; E=40,000; S=119,999; M=0; inc=true; U=0; T=500,000; C=0; L=24; K=null | O=40,000; P=40,000; SR=50; LC=2.999975; MC=2.999975; EB=0; PS=119,999; US=0 | Rem=500,000; Contrib=40,000; EM=13; Req=20,834; OnTrack=true; GA=false | low_mandatory_coverage |
| A7a | Shock exactly funded | I=70,000; E=45,000; S=50,000; M=0; inc=true; U=50,000; T=200,000; C=0; L=18; K=null | O=45,000; P=25,000; SR=35.714286; LC=1.111111; MC=1.111111; EB=0; PS=0; US=0 | Rem=200,000; Contrib=25,000; EM=8; Req=11,112; OnTrack=true; GA=false | low_mandatory_coverage |
| A7b | Shock unfunded by 1 | I=70,000; E=45,000; S=50,000; M=0; inc=true; U=50,001; T=200,000; C=0; L=18; K=null | O=45,000; P=25,000; SR=35.714286; LC=1.111111; MC=1.111111; EB=0; PS=0; US=1 | Rem=200,000; Contrib=25,000; EM=8; Req=11,112; OnTrack=true; GA=false | low_mandatory_coverage (warning); unfunded_shock (critical) |
| A8 | Goal achieved exactly | I=60,000; E=30,000; S=100,000; M=0; inc=true; U=0; T=150,000; C=150,000; L=12; K=null | O=30,000; P=30,000; SR=50; LC=3.333333; MC=3.333333; EB=0; PS=100,000; US=0 | Rem=0; Contrib=30,000; EM=0; Req=0; OnTrack=true; GA=true | goal_achieved (positive) |
| A9a | Unreachable goal, zero contribution | I=50,000; E=50,000; S=10,000; M=0; inc=true; U=0; T=100,000; C=0; L=12; K=null | O=50,000; P=0; SR=0; LC=0.2; MC=0.2; EB=0; PS=10,000; US=0 | Rem=100,000; Contrib=0; EM=null; Req=8,334; OnTrack=null; GA=false | break_even (warning); low_mandatory_coverage (warning) |
| A9b | Explicit contribution, timeline missed | I=50,000; E=50,000; S=10,000; M=0; inc=true; U=0; T=100,000; C=0; L=12; K=5,000 | O=50,000; P=0; SR=0; LC=0.2; MC=0.2; EB=0; PS=10,000; US=0 | Rem=100,000; Contrib=5,000; EM=20; Req=8,334; OnTrack=false; GA=false | break_even (warning); low_mandatory_coverage (warning); unaffordable_goal_contribution (warning) |
| A10 | Month-end and leap-year clamping | I=10,000; E=10,000; S=0; M=0; inc=true; U=0; T=100; C=0; L=12; K=100; as-of varies | O=10,000; P=0; SR=0; LC=0; MC=0; EB=0; PS=0; US=0 | Rem=100; Contrib=100; EM=1; Req=9; OnTrack=true; GA=false | break_even (warning); low_mandatory_coverage (warning); unaffordable_goal_contribution (warning) |
| A10b | Mid-month two-month projection | I=10,000; E=10,000; S=0; M=0; inc=true; U=0; T=200; C=0; L=12; K=100; as-of=2024-01-15 | O=10,000; P=0; SR=0; LC=0; MC=0; EB=0; PS=0; US=0 | Rem=200; Contrib=100; EM=2; Req=17; OnTrack=true; GA=false | break_even (warning); low_mandatory_coverage (warning); unaffordable_goal_contribution (warning) |
| A11 | Floating-point month rounding | I=1; E=1; S=1; M=0; inc=true; U=0; T=0.07; C=0; L=12; K=0.01 | O=1; P=0; SR=0; LC=1; MC=1; EB=0; PS=1; US=0 | Rem=0.07; Contrib=0.01; EM=7; Req=1; OnTrack=true; GA=false | break_even (warning); low_mandatory_coverage (warning); unaffordable_goal_contribution (warning) |
| A12 | Scenario comparison with zero baseline | Baseline: I=50,000; E=50,000; S=0; M=0; inc=true; U=0; T=100,000; C=0; L=12; K=null. Scenario: I=60,000; S=10,000; other fields same | Baseline: O=50,000; P=0; SR=0; LC=0; MC=0; EB=0; PS=0; US=0. Scenario: O=50,000; P=10,000; SR=16.666667; LC=0.2; MC=0.2; EB=0; PS=10,000; US=0 | Baseline: Rem=100,000; Contrib=0; EM=null; Req=8,334; OnTrack=null; GA=false. Scenario: Rem=100,000; Contrib=10,000; EM=10; Req=8,334; OnTrack=true; GA=false | Baseline: break_even (warning); low_mandatory_coverage (warning). Scenario: low_mandatory_coverage (warning). Diff: added=[]; resolved=[break_even]; unchanged=[low_mandatory_coverage]; severityChanged=[] |
| A12b | Scenario comparison with negative change | Baseline: I=50,000; E=50,000; S=0; M=0; inc=true; U=0; T=100,000; C=0; L=12; K=null. Scenario: I=40,000; other fields same | Baseline: O=50,000; P=0; SR=0; LC=0; MC=0; EB=0; PS=0; US=0. Scenario: O=50,000; P=-10,000; SR=-25; LC=0; MC=0; EB=0; PS=0; US=0 | Baseline: Rem=100,000; Contrib=0; EM=null; Req=8,334; OnTrack=null; GA=false. Scenario: Rem=100,000; Contrib=0; EM=null; Req=8,334; OnTrack=null; GA=false | Baseline: break_even (warning); low_mandatory_coverage (warning). Scenario: deficit (critical); low_mandatory_coverage (warning). Diff: added=[deficit]; resolved=[break_even]; unchanged=[low_mandatory_coverage]; severityChanged=[] |
| A13 | Threshold override | I=100,000; E=60,000; S=150,000; M=0; inc=true; U=0; T=100,000; C=0; L=12; K=null; low-coverage threshold=2 | O=60,000; P=40,000; SR=40; LC=2.5; MC=2.5; EB=0; PS=150,000; US=0 | Rem=100,000; Contrib=40,000; EM=3; Req=8,334; OnTrack=true; GA=false | none (2.5 is not below 2; contribution equals surplus) |
| A14 | Explanation structure | Any representative valid case | All 14 core metrics present | All 11 computed goal fields present | Every recommendation has id, severity, trigger, formula, inputs, reason, assumptions, suggestedAction, heuristic, and threshold fields; threshold may be null for non-threshold rules; no duplicate IDs; no `undefined` or `[object Object]` |
| A15 | Validation acceptance/rejection | 31 invalid and 5 valid cases (see §4.5) | N/A | N/A | Invalid rejected with the expected message; valid accepted |
| A16 | No target (null propagation) | I=60,000; E=30,000; S=100,000; M=0; inc=true; U=0; T=null; C=5,000; L=12; K=null | O=30,000; P=30,000; SR=50; LC=3.333333; MC=3.333333; EB=0; PS=100,000; US=0 | Target=null; Rem=null; Contrib=30,000; EM=null; unreachable=null; Req=null; OnTrack=null; GA=null; completionDate=null | none |
| A17 | Goal already exceeded | I=60,000; E=30,000; S=100,000; M=0; inc=true; U=0; T=100,000; C=150,000; L=12; K=null | O=30,000; P=30,000; SR=50; LC=3.333333; MC=3.333333; EB=0; PS=100,000; US=0 | Rem=0; Contrib=30,000; EM=0; Req=0; OnTrack=true; GA=true; completionDate=as-of | goal_achieved (positive) |

**Case A10 date expectations.** With `EM=1`:

- `2024-01-31` → `2024-02-29` (leap year)
- `2023-01-31` → `2023-02-28`
- `2024-08-31` → `2024-09-30`

With `EM=2` and `as-of=2024-01-15` → `2024-03-15`.

**Case A11 note.** A naive `Math.ceil(0.07 / 0.01)` produces 8 because
`0.07 / 0.01 === 7.000000000000001`. The expected value is 7. This case tests
the epsilon-tolerant `ceilMonths` helper.

**Case A12 note.** The baseline surplus and savings are zero, so the percentage
change for those metrics must be `null`, not infinity or zero. The savings-rate
percentage-point difference is 16.666667. The goal direction is `null` because
the baseline has no estimated completion date.

**Case A12b note.** The scenario has a negative surplus. The surplus percentage
change is `null` because the baseline surplus is zero. The `deficit`
recommendation is added and `break_even` is resolved; `low_mandatory_coverage`
remains.

**Case A16 note.** With no target amount, `remainingAmount`, `estimatedMonths`,
`unreachable`, `requiredMonthlyContributionForTimeline`,
`onTrackForRequestedTimeline`, `goalAchieved`, and `estimatedCompletionDate` are
all `null`. `assumedMonthlyContribution` is still computed from the surplus.
This tests that a missing target does not become zero.

**Case A17 note.** When current goal savings exceed the target, the remaining
amount clamps to zero and `goalAchieved` is `true`. Because `EM=0`, the
estimated completion date equals the as-of date (the same rule applies to A8).

### 4.5 Validation cases

**Invalid cases (must be rejected with the expected message):**

| Case | Input | Expected outcome |
| --- | --- | --- |
| V1 | `monthlyIncome = -1` | Reject: non-negative number required |
| V2 | `monthlyIncome = NaN` | Reject: finite number required |
| V3 | `monthlyIncome = Infinity` | Reject: finite number required |
| V4 | `monthlyIncome = "abc"` | Reject: numeric value required |
| V5 | `monthlyIncome = true` | Reject: numeric value required |
| V6 | `monthlyIncome` missing | Reject: required field |
| V7 | `goal = ""` | Reject: non-empty goal required |
| V8 | `goal = "unsupported"` | Reject: unsupported goal |
| V9 | `targetAmount = 0` | Reject: positive target required |
| V10 | `goalTimelineMonths = 0` | Reject: positive whole number required |
| V11 | `goalTimelineMonths = 1.5` | Reject: positive whole number required |
| V12 | `asOfDate = "2023-02-29"` | Reject: invalid calendar date |
| V13 | `thresholds.lowMandatoryCoverageMonths = 0` | Reject: positive threshold required |
| V14 | `thresholds.highEmiBurdenPct = -1` | Reject: positive threshold required |
| V15 | `thresholds = []` | Reject: plain object required |
| V16 | Negative `monthlyExpenses` | Reject |
| V17 | Negative `accessibleSavings` | Reject |
| V18 | Negative `emiPayments` | Reject |
| V19 | Negative `unexpectedExpense` | Reject |
| V20 | Negative `currentGoalSavings` | Reject |
| V21 | Negative `monthlySavingsCapacity` | Reject |
| V22 | Non-numeric `monthlyExpenses` | Reject |
| V23 | Non-numeric `accessibleSavings` | Reject |
| V24 | Non-numeric `emiPayments` | Reject |
| V25 | Non-numeric `unexpectedExpense` | Reject |
| V26 | Non-numeric `targetAmount` | Reject |
| V27 | Non-numeric `currentGoalSavings` | Reject |
| V28 | Non-numeric `goalTimelineMonths` | Reject |
| V29 | Non-boolean `emiIncludedInExpenses` | Reject |
| V30 | Invalid `asOfDate` format | Reject |
| V31 | Invalid preview object for comparison | Reject |

**Valid cases (must be accepted):**

| Case | Input | Expected outcome |
| --- | --- | --- |
| V32 | Minimal profile with valid goal | Accept |
| V33 | All-zero income, expenses, savings, EMI, shock | Accept |
| V34 | Explicit `null` for optional fields | Accept, using documented defaults |
| V35 | `asOfDate = "2024-02-29"` | Accept |
| V36 | Fractional amounts and numeric strings | Accept |

For every rejection, the error message must be non-empty, must match the expected
rule, and must not contain `undefined` or `[object Object]`.

### 4.6 File format and harness

The suite should be stored as versioned fixtures, separate from the engine:

```
docs/reference-suite/
  cases.v1.csv          # inputs, category, as-of date, thresholds
  expected.v1.csv       # case_id, field, expected value, tolerance, derivation note
  checksums.txt         # SHA-256 of both files
  README.md             # derivation method, adjudication log, version history
```

`cases.v1.csv` columns:

`case_id, category, monthly_income, monthly_expenses, accessible_savings,
emi_payments, emi_included_in_expenses, unexpected_expense, target_amount,
current_goal_savings, goal_timeline_months, monthly_savings_capacity,
as_of_date, low_coverage_threshold, high_emi_threshold, notes`

`expected.v1.csv` columns:

`case_id, field, expected_value, value_type, tolerance, derivation_note`

The harness must:

- load the fixtures without importing engine constants;
- call the public engine API;
- compare every expected field;
- report per-case and per-field failures, not only aggregates;
- distinguish numeric mismatch, null mismatch, string mismatch, and missing
  field;
- write a machine-readable results file and a human-readable report;
- record the engine version, fixture checksum, Node.js version, and date;
- never modify the fixtures.

### 4.7 Acceptance criteria

- **A1–A13, A16–A17:** 100% of hand-derived fields match, including nulls and
  dates.
- **A14:** 100% of explanation-structure checks pass.
- **A15:** 100% of invalid cases are rejected with the expected message; 100% of
  valid cases are accepted.
- **No null mismatch:** a `null` expected value must not be satisfied by `0`,
  `""`, or `NaN`.
- **No silent tolerance:** any value outside `1e-9` relative tolerance is a
  failure.
- **All failures reported:** no aggregate-only reporting.
- **Release rule:** any failure blocks a claim of correctness; it does not block
  documentation of the failure.

Passing the suite establishes agreement with hand-derived expectations. It does
not establish financial appropriateness, user comprehension, or real-world
effectiveness.

### 4.8 What the suite does not establish

- That the formulas are the only reasonable ones.
- That the thresholds are appropriate.
- That the recommendations are helpful or harmless.
- That users understand the output.
- That the tool improves outcomes.
- That the results generalize beyond the cases.

---

## 5. Expert review protocol

### 5.1 Purpose

Expert review assesses **content validity**: whether the formulas, assumptions,
thresholds, explanations, and recommendations are plausible and appropriate for
the intended users, and whether they could cause harm.

It is not a substitute for user studies or field evidence. Experts can judge
plausibility; they cannot estimate population effects.

### 5.2 Participants

Recruit 3–5 independent experts:

- a SEBI-registered investment adviser or certified financial planner practising
  in India;
- a personal-finance or household-finance academic;
- a consumer-protection or behavioural-finance researcher;
- optionally, a credit counsellor or financial-education practitioner.

**Independence:** no financial or employment relationship with the project.
Disclose any conflict. Experts should not have contributed to the engine design.

**Diversity:** include academic, practitioner, and consumer perspectives. Avoid a
panel that shares the same professional norms.

### 5.3 Materials

- This protocol and `docs/DIGITAL_TWIN.md`.
- The formula table and threshold table.
- 10–15 representative cases, including edge cases A1–A15.
- Example explanation payloads.
- The disclaimer and "estimate, not prediction" notice.
- A rating rubric.

Experts should be blinded to Phase 4 pass rates to avoid anchoring on the
project's own claims.

### 5.4 Rating rubric

Each item is rated 1–5:

| Dimension | 1 | 3 | 5 |
| --- | --- | --- | --- |
| Formula correctness | Clearly wrong | Plausible but questionable | Correct for the stated purpose |
| Assumption plausibility | Unrealistic | Simplifying but defensible | Appropriate and clearly stated |
| Threshold appropriateness | Likely harmful | Defensible heuristic | Well justified for the context |
| Explanation clarity | Confusing | Understandable with effort | Clear to the intended user |
| Actionability | Cannot act | Some guidance | Clear, feasible next step |
| Harm potential | Likely harm | Possible confusion or overtrust | Low risk with safeguards |
| Scope appropriateness | Overclaims | Some overreach | Claims match evidence |

Also collect open comments and a "critical issue" flag for any item that could
cause material harm.

### 5.5 Procedure

1. **Independent review.** Each expert reviews the materials alone and submits
   ratings and comments.
2. **Think-aloud session.** A 60–90 minute session with each expert, using 3–5
   cases, to surface reasoning and ambiguities.
3. **Consensus meeting.** Discuss disagreements; do not force consensus. Record
   minority views.
4. **Adjudication.** The research lead classifies each issue as critical, major,
   minor, or no action, with a rationale.
5. **Reporting.** Report all ratings, including low ones; report inter-rater
   agreement descriptively; report conflicts of interest.

### 5.6 Analysis

- Median and interquartile range for each dimension.
- Content validity index (CVI) if a relevance rating is added.
- Thematic analysis of open comments.
- A table of critical and major issues with resolution status.
- A sensitivity analysis of thresholds using expert-suggested ranges.

### 5.7 What expert review can and cannot establish

**Can establish:**

- whether formulas are plausible for the stated purpose;
- whether assumptions are clearly stated and defensible;
- whether thresholds are reasonable or need calibration;
- whether explanations are clear to an expert reader;
- whether there are obvious harm risks;
- whether claims exceed the evidence.

**Cannot establish:**

- population-level effectiveness;
- user comprehension;
- causal outcomes;
- generalizability;
- absence of harm.

### 5.8 Current status

**No external expert review has been performed.** This section is a protocol, not
a result. No claim of content validity should be made until it is executed.

---

## 6. User study protocol

### 6.1 Purpose

The user study tests whether B (assessment + Digital Twin) improves
comprehension, usability, trust calibration, and decision support relative to A
(static assessment). It does not test long-term financial outcomes.

### 6.2 Design options

| Design | Advantages | Risks | Recommended use |
| --- | --- | --- | --- |
| Within-subject, counterbalanced | Controls for individual differences; smaller sample | Carryover and learning effects | Comprehension and usability |
| Between-subject | Cleaner causal interpretation; no carryover | Larger sample; individual differences | Decision quality and trust calibration |
| Mixed design | Can test both | More complex analysis | Larger study |

**Recommended initial design:** randomized within-subject with counterbalanced
order for comprehension and usability, plus a between-subject decision-quality
task if carryover is a concern.

### 6.3 Conditions

**A — Static assessment:**

- input a profile;
- view the snapshot metrics and recommendations;
- no scenario controls, no side-by-side comparison, no goal-contribution
  simulation.

**B — Assessment + Digital Twin:**

- input the same profile;
- view the snapshot;
- modify scenario inputs;
- view side-by-side comparison, goal projection, and recommendation diff;
- view explanations.

Both conditions should use the same visual style and disclaimer to avoid
confounding design with capability.

### 6.4 Tasks

1. **Interpretation:** "What is this household's monthly surplus?" "How many
   months of mandatory outflows can their savings cover?"
2. **Risk identification:** "Which issue is most urgent?"
3. **Scenario prediction:** "If expenses rise by INR 5,000, what happens to the
   surplus and the goal timeline?"
4. **Decision:** "Which of these three changes would you recommend first, and
   why?"
5. **Comparison:** "Which scenario is better for the goal, and by how much?"
6. **Explanation:** "Why did the system flag this recommendation?"
7. **Trust calibration:** "How confident are you in your answer?" (1–7)

### 6.5 Outcomes

| Outcome | Measure | Type |
| --- | --- | --- |
| Comprehension | Accuracy on interpretation and explanation questions | Primary |
| Decision quality | Agreement with an expert-defined rubric for the best action | Primary |
| Trust calibration | Confidence–accuracy gap; overtrust and undertrust rates | Primary |
| Cognitive load | NASA-TLX or perceived effort | Secondary |
| Usability | SUS; task completion; time on task | Secondary |
| Scenario use | Number and relevance of scenarios explored | Process |
| Perceived usefulness | Short Likert scale | Secondary |
| Behavioural intention | Short Likert scale | Secondary, not a behaviour measure |

Do not measure "financial literacy" with a short post-task quiz and call it
literacy. If literacy is an outcome, use a validated instrument and a
pre-post design.

### 6.6 Sample

- **Population:** Indian adults, 18+, who manage household finances or expect to.
- **Stratification:** income, education, gender, region, digital comfort, and
  language.
- **Exclusions:** financial professionals, the project team, and anyone who has
  seen the tool before.
- **Size:** a formal power analysis is required. As an illustration, a two-tailed
  test at alpha = .05 with 80% power and a moderate between-subject effect
  (d = 0.5) requires about 64 participants per arm. A within-subject design
  requires fewer participants but has carryover risk. These are planning
  illustrations, not results.
- **Recruitment:** community groups, universities, financial-literacy NGOs, and
  online panels. Avoid a convenience sample of only highly educated urban users
  if the claim is about beginners.

### 6.7 Ethics

- Informed consent.
- Use fictional profiles; do not require real financial data.
- Data minimization and secure storage.
- Right to withdraw.
- Debrief, including an explanation that the tool is educational and not
  financial advice.
- Compensation appropriate to time and context.
- Ethics review if required by the institution.

### 6.8 Analysis plan

- Pre-register the primary outcomes, hypotheses, and analysis.
- Use mixed-effects models for within-subject designs.
- Report effect sizes with confidence intervals, not only p-values.
- Analyze comprehension and calibration separately; high confidence with low
  accuracy is overtrust, not success.
- Pre-specify subgroup analyses; label exploratory analyses as exploratory.
- Report all deviations and missing data.
- Do not claim equivalence from a non-significant result without a power
  analysis.

### 6.9 Decision rules

**Evidence for incremental value:**

- B improves the primary comprehension or decision-quality outcome with a
  pre-specified effect and confidence interval;
- B does not increase overconfidence or harm;
- the effect is robust to order and subgroup checks.

**Evidence against incremental value:**

- no difference on the primary outcome;
- worse comprehension or higher overconfidence;
- higher cognitive load without a decision-quality benefit;
- users abandon the scenario controls.

**Inconclusive:**

- underpowered study;
- high attrition;
- ambiguous task;
- confounding design differences.

### 6.10 Current status

**No user study has been performed.** No claim of improved comprehension, trust,
usability, literacy, resilience, or well-being is supported.

---

## 7. A/B capability comparison (not outcomes)

This table compares **what A and B can do**, not what they achieve. B is a
superset of A in capabilities. That does not imply B is better for every user;
more capability can increase complexity.

| Capability | A: Static assessment | B: Assessment + Digital Twin | Evidence status |
| --- | --- | --- | --- |
| Compute baseline metrics | Yes | Yes | Implemented; Phase 4 tested |
| Rule-based recommendations | Yes | Yes | Implemented; Phase 4 tested |
| Formula/input/assumption explanations | Partial | Yes | Implemented; adequacy unverified |
| Modify income, expenses, savings, EMI, shock | No | Yes | Implemented; Phase 4 tested |
| Side-by-side baseline/scenario comparison | No | Yes | Implemented; Phase 4 tested |
| Goal projection under changed contribution | No | Yes | Implemented; Phase 4 tested |
| Recommendation added/resolved/unchanged | No | Yes | Implemented; Phase 4 tested |
| Save, load, rename, delete scenarios | No | Yes | Implemented; hosted DB verification pending |
| Compare two saved scenarios | No | Yes | Implemented; hosted DB verification pending |
| Explore multiple what-if paths | No | Yes | Capability only; no user evidence |
| Improved comprehension | Not claimed | Not claimed | No evidence |
| Improved decision quality | Not claimed | Not claimed | No evidence |
| Improved trust | Not claimed | Not claimed | No evidence |
| Improved literacy | Not claimed | Not claimed | No evidence |
| Improved resilience or well-being | Not claimed | Not claimed | No evidence |

### 7.1 No-claim list

Do not claim that B:

- improves financial outcomes;
- increases financial resilience;
- improves financial literacy;
- increases trust or reduces distrust;
- reduces financial stress;
- is more engaging, usable, or persuasive;
- produces better decisions;
- is personalized advice;
- is validated, proven, or optimal;
- generalizes from Phase 4 synthetic results.

These claims require the studies described in this protocol.

---

## 8. Reproducibility protocol

### 8.1 For the deterministic engine

Record:

- repository commit or working-tree hash;
- Node.js version and operating system;
- package-lock version;
- seed, profile count, as-of date, and thresholds;
- fixture checksum;
- command used;
- start and end timestamps;
- artifact manifest with SHA-256 checksums.

Run:

1. the full test suite;
2. the Phase 4 experiment with the recorded seed;
3. the hand-derived reference suite;
4. the manifest verification;
5. a second run in the same environment;
6. a second environment (different OS or Node.js version) if available.

Compare:

- stable serialization of results;
- per-field values, not only aggregates;
- manifest checksums;
- report byte equality where expected.

### 8.2 For expert review

- Pre-register the materials, rubric, and analysis.
- Record expert roles, conflicts, and independence.
- Keep anonymized raw ratings.
- Report all items and disagreements.
- Archive the protocol version used.

### 8.3 For user studies

- Pre-register hypotheses, primary outcomes, sample size, and analysis.
- Freeze the task materials and randomization.
- Record deviations.
- Archive anonymized data and analysis code.
- Report effect sizes and confidence intervals.

### 8.4 Current status

- Same-process determinism was verified in Phase 4.
- Cross-environment reproducibility was not verified.
- The hand-derived suite has not been executed.
- Expert review and user studies have not been conducted.

---

## 9. Validity threats and mitigations

| Threat | Type | Mitigation | Residual risk |
| --- | --- | --- | --- |
| Reference-implementation bias | Internal | Hand-derived expected values; separate reviewer; no engine imports | Same-project bias remains |
| Synthetic data | External | Label as test fixture; do not infer population | No population inference |
| Hand-designed cases | Construct | Coverage matrix; boundary cases; expert review | Unknown unknowns |
| No real-world outcomes | External | No outcome claims; future field study | Cannot claim effectiveness |
| No user study | External | User-study protocol | Cannot claim trust, literacy, or comprehension |
| No expert review | Content | Expert-review protocol | Cannot claim content validity |
| Model scope | Construct | Disclose no returns, inflation, taxes, interest, income changes, borrowing, or asset sales | Projections are simplified |
| Thresholds are heuristics | Construct | Disclose; make configurable; sensitivity analysis | Defaults may be inappropriate |
| Generalizability | External | India-first; stratified sampling in future | Limited to sampled contexts |
| Single environment | Reproducibility | Second environment; manifest | Cross-platform risk |
| Hosted database unverified | Implementation | End-to-end test with real accounts | Persistence and security risk |
| Publication bias | Evidence | Purposive review; disclose | Overestimation of effects |
| Demand characteristics | User study | Neutral framing; blinded tasks; counterbalancing | Bias remains |
| Overtrust | User study | Calibration measures; warnings; explanation design | Hard to eliminate |
| Privacy | Ethics | Fictional profiles; consent; data minimization | Residual |
| Misinterpretation of "resilience" | Construct | Use "indicator", not "score"; disclaimers | Users may still overinterpret |
| False precision | Construct | Show ranges or assumptions where possible; avoid spurious decimals | Deterministic output can look exact |

---

## 10. Prioritized future empirical-validation plan

The order is deliberate: correctness and content validity first, then user
comprehension, then decision support, then outcomes. Do not skip to outcomes.

| Priority | Study | RQ | Design | Sample | Outcomes | Dependencies | Effort | What it would establish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | Execute hand-derived reference suite | RQ1, RQ5, RQ6 | Software test with frozen fixtures | 24 case entries (A1–A17, including variants) | Pass rates; per-field failures | Fixture review | Low | Agreement with independently derived expectations |
| P0 | Expert review | RQ3, RQ4, RQ5, RQ6 | 3–5 independent experts; rubric; consensus | 3–5 experts | Content validity; threshold concerns; harm flags | Materials; ethics if needed | Medium | Formula, assumption, threshold, and explanation plausibility |
| P0 | Threshold sensitivity analysis | RQ5 | Recompute recommendations across a plausible threshold range | All reference cases | Recommendation changes; boundary maps | Reference suite | Low–medium | Which conclusions depend on threshold choices |
| P1 | Usability and comprehension study | RQ3, RQ9 | Within-subject, counterbalanced | 30–40 | Comprehension; SUS; trust calibration; cognitive load | Expert-reviewed materials | Medium | Whether B is understandable and usable |
| P1 | Randomized decision-support study | RQ7 | Between-subject A vs B | About 128 (64 per arm; power analysis required) | Decision quality; confidence calibration; scenario use | P0 and P1 | High | Whether B adds decision-support value over A |
| P2 | Longitudinal pilot | RQ8 | Pre-post with comparison group | 200–300 | Behaviour, resilience, well-being; adverse events | P1; validated measures | High | Whether use is associated with changes |
| P2 | Randomized field trial | RQ8 | RCT with follow-up | Power analysis | Validated outcomes; persistence; heterogeneity | P2; ethics; partnerships | Very high | Causal effects, if any |
| P3 | India-stratified study | RQ10 | Stratified sample; subgroup analysis | 300+ | Comprehension, use, and trust across groups | P1 | High | Generalizability and fairness |
| P3 | Cross-platform reproducibility | RQ2 | Multi-environment runs | 2+ environments | Determinism; manifest equality | P0 | Low | Reproducibility beyond one environment |
| P4 | Hosted Supabase end-to-end test | Implementation | Real accounts; migration applied | Small pilot | Persistence, ownership, RLS | Phase 3 migration | Medium | Deployment readiness |

### 10.1 Sequencing rationale

- **P0 first:** without correctness and content validity, user studies may test a
  flawed artifact.
- **P1 next:** comprehension and usability are prerequisites for interpreting
  decision-support results.
- **P2 after P1:** outcome studies are expensive and should use materials that
  have been shown to be understandable.
- **P3 in parallel where feasible:** stratification improves generalizability but
  does not replace the core studies.
- **P4 is operational:** it does not answer a research question but is necessary
  for a deployed product.

### 10.2 Stop rules

- If the reference suite fails, do not proceed to expert review as if the
  calculations were correct; fix or document first.
- If experts flag a critical harm issue, pause user studies until resolved.
- If the comprehension study shows systematic misunderstanding, do not run the
  decision-support study with the same materials; revise first.
- If the decision-support study shows harm (e.g., overconfidence), do not claim
  benefit and investigate.

---

## 11. Suggested revisions to claims, contributions, and limitations

### 11.1 Claim audit

| Current wording or implication | Location | Issue | Suggested revision | Evidence status |
| --- | --- | --- | --- | --- |
| "AI-Powered Financial Literacy Platform" | `README.md` title | The AI tutor is real, but the assessment and Twin are deterministic; the title can imply ML advice | "AI-assisted financial literacy platform with a deterministic assessment and Digital Twin" | AI tutor implemented; deterministic engine tested |
| "trustworthy" | `README.md` | Trust is not measured | "designed for transparency and explicit assumptions" | No user study |
| "master money management" | `README.md` | Outcome claim | "learn money-management concepts and explore financial scenarios" | No outcome evidence |
| "without jargon, speculation, or high-risk claims" | `README.md` | Design intent; verify content | Keep, and add "educational, not financial advice" | Content review pending |
| "formula correctness" | `docs/RESEARCH_EVALUATION.md` | Can be read as external validation | "agreement with a separately implemented reference" | Phase 4 |
| "recommendation consistency" | `docs/RESEARCH_EVALUATION.md` | Can be read as advice quality | "rule-trigger consistency" | Phase 4 |
| "explainability coverage" | `docs/RESEARCH_EVALUATION.md` | Presence is not comprehension | "explanation-field coverage" | Phase 4 |
| "estimate, not prediction" | `docs/DIGITAL_TWIN.md` | Good; keep | Keep and add model-scope sentence | Documented |
| "personalized" advice | Any product copy | The tool gives rule-based educational feedback, not regulated advice | "educational, rule-based feedback" | No adviser review |
| "improves resilience / well-being / literacy" | Any product copy | No evidence | "designed to support exploration; effects not evaluated" | No study |
| "validated" | Any product copy | No external validation | "implementation-consistency tested; not externally validated" | Phase 4 |
| "optimal" | Any product copy | The model does not optimize | "deterministic projection" | Model scope |

### 11.2 Suggested contribution statements

Use:

1. "We implement a deterministic Financial Digital Twin that recomputes
   household financial indicators under user-specified scenarios and exposes the
   formula, inputs, assumptions, and heuristic threshold for every metric and
   recommendation."
2. "We provide a reproducible evaluation harness with a separately implemented
   reference, a synthetic edge-case and scenario suite, and manifest-verified
   artifacts."
3. "We report implementation-consistency and explanation-field coverage results
   across 1,642 synthetic results. These results are not evidence of real-world
   effectiveness."
4. "We specify a validation protocol that separates software correctness, expert
   content validity, user comprehension and decision support, and longitudinal
   outcomes."

Avoid:

- "first", "novel", "state-of-the-art";
- "validated", "proven", "optimal";
- "improves outcomes", "increases trust", "improves literacy";
- "measures financial resilience";
- "personalized financial advice";
- "AI-powered advice" when describing the deterministic engine.

### 11.3 Suggested limitations paragraph

> This work has several limitations. The evaluation uses synthetic profiles and
> hand-designed edge cases, not a representative sample of Indian households.
> The separately implemented reference was written by the same project, so
> agreement reduces the risk of transcription errors but does not provide an
> external mathematical oracle. No external expert review, user study, field
> trial, or longitudinal outcome study was conducted. The engine does not model
> investment returns, inflation, taxes, interest, future income changes,
> borrowing, or asset sales, and it assumes a constant monthly goal
> contribution. The 3-month coverage and 40% EMI thresholds are configurable
> heuristics, not universal standards. The indicators are construct-specific
> operationalizations, not a validated measure of financial resilience.
> Reproducibility was tested in a single environment, and the hosted Supabase
> deployment has not been end-to-end verified. The results therefore establish
> implementation consistency and explanation-field coverage only; they do not
> establish real-world accuracy, effectiveness, trust, literacy, resilience, or
> well-being, and they should not be generalized beyond the tested cases.

### 11.4 Suggested abstract or conclusion wording

> We present a deterministic, explainable financial assessment and what-if tool
> for Indian beginners. The system computes a bounded set of household financial
> indicators and rule-based recommendations, and exposes its formulas, inputs,
> assumptions, and heuristic thresholds. An evaluation against a separately
> implemented reference on 1,642 synthetic results found agreement within the
> pre-specified tolerance on the tested metrics, goals, comparisons, and
> recommendation triggers, and complete explanation-field coverage. These
> results establish implementation consistency, not real-world effectiveness. We
> propose a validation protocol combining hand-derived reference cases, expert
> review, and user studies, and we do not claim improvements in financial
> outcomes, trust, or literacy.

### 11.5 Suggested "what this contributes" and "what this does not" table

| This work contributes | This work does not contribute |
| --- | --- |
| A deterministic, explainable assessment and Twin | A predictive model of financial outcomes |
| Explicit formulas, inputs, assumptions, and thresholds | A validated measure of financial resilience |
| A reproducible evaluation harness and artifacts | External expert validation |
| Implementation-consistency evidence on synthetic cases | Evidence of improved decisions, trust, or literacy |
| A validation protocol separating evidence types | A causal field study or RCT |
| A transparent India-first design | Proof of generalizability or cultural validity |

---

## 12. What Phase 5 does not do

- It does not modify code, tests, Phase 4 results, Findex data or models, or
  hosted database configuration.
- It does not conduct an expert review or a user study.
- It does not collect real-world outcome data.
- It does not claim that Phase 4 synthetic results are independent evidence.
- It does not start Phase 6.
- It does not commit or push changes.

---

## 13. References

Full bibliographic details are in `docs/LITERATURE_REVIEW.md` §13. The sources
cited in this protocol are:

- Beketov, Lehmann, and Wittke (2018)
- Bhat, Lone, Sivakumar, and Krishna (2025)
- Brüggen, Hogreve, Holmlund, Kabadayi, and Löfgren (2017)
- Černevičienė and Kabašinskas (2024)
- Choung, Chatterjee, and Pak (2023)
- Das, Ostrov, Radhakrishnan, and Srivastav (2020)
- Fernandes, Lynch, and Netemeyer (2014)
- Fisch, Labouré, and Turner (2019)
- Kaiser and Menkhoff (2017)
- Klapper and Lusardi (2020)
- Kumar, Pillai, Kumar, and Tabash (2023)
- Lusardi and Mitchell (2014)
- Mullainathan, Nöth, and Schoar (2012)
- Netemeyer, Warmath, Fernandes, and Lynch (2018)
- OECD (2026)
- Rao and Yang (2022)
- Reher and Sokolinski (2024)
- Salignac, Marjolin, Reeve, and Muir (2019)
- Stolper and Walter (2017)
- Tahir and Richards (2025)
- Tertilt and Scholz (2018)
- World Bank (2025)
- Xiao, Huang, Goyal, and Kumar (2022)
