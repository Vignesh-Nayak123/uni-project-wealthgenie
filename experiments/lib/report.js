/**
 * Markdown report renderer for the Phase 4 experiment.
 *
 * Every number in the generated report comes from the actual `runExperiment`
 * result. The report deliberately separates implementation-consistency
 * measures from real-world financial effectiveness and from user-study claims.
 */

import {
  COMPARISON_METRIC_DEFINITIONS,
  CORE_METRIC_KEYS,
  GOAL_FIELD_KEYS,
  RECOMMENDATION_IDS,
} from './reference.js';

function escapeCell(value) {
  return String(value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

function table(headers, rows) {
  const header = `| ${headers.map(escapeCell).join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(
    (row) => `| ${row.map(escapeCell).join(' | ')} |`
  );
  return [header, divider, ...body].join('\n');
}

function fmt(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value)) return value.toLocaleString('en-IN');
    return value.toLocaleString('en-IN', { maximumFractionDigits: 6 });
  }
  return String(value);
}

function pct(rate) {
  if (rate === null || rate === undefined) return 'n/a';
  return `${(rate * 100).toFixed(2)}%`;
}

function counterText(counter) {
  if (!counter || !counter.total) return 'n/a (0/0)';
  return `${counter.passed}/${counter.total} (${pct(counter.rate)})`;
}

function counterRate(counter) {
  if (!counter || !counter.total) return 'n/a';
  return pct(counter.rate);
}

function findGoalRow(rows, caseId, field) {
  return rows.find(
    (row) =>
      row.caseId === caseId &&
      row.field === field &&
      row.group === 'goalProjection'
  );
}

function findMetricRow(rows, caseId, metric) {
  return rows.find(
    (row) => row.caseId === caseId && row.metric === metric
  );
}

function findRecommendationRow(rows, caseId, recommendationId) {
  return rows.find(
    (row) =>
      row.caseId === caseId &&
      row.kind === 'decision' &&
      row.recommendationId === recommendationId
  );
}

function boundaryValue(row) {
  if (!row) return 'not found';
  return `${fmt(row.actual)} (expected ${fmt(row.expected)}; ${row.pass ? 'pass' : 'fail'})`;
}

function failureSummary(run) {
  const counts = run.summary.failureCounts;
  const rows = Object.entries(counts).map(([category, count]) => [
    category,
    count,
  ]);
  rows.push(['total', run.summary.totalFailureCount]);
  rows.push(['stored examples', run.summary.storedFailureCount]);
  return table(['Category', 'Failures'], rows);
}

function failureExamples(run, limit = 12) {
  const failures = run.failures;
  if (failures.length === 0) {
    return 'No failed assertions were recorded in this run.';
  }

  const rows = failures.slice(0, limit).map((failure) => [
    failure.category,
    failure.scope ?? '',
    failure.caseId ?? '',
    failure.field ?? failure.check ?? failure.invariant ?? '',
    fmt(failure.expected),
    fmt(failure.actual),
    failure.detail ?? '',
  ]);

  return table(
    ['Category', 'Scope', 'Case', 'Field/check', 'Expected', 'Actual', 'Detail'],
    rows
  );
}

function artifactList() {
  return [
    'run.json',
    'dataset.json',
    'profiles.csv',
    'scenario-cases.csv',
    'metric-results.csv',
    'goal-results.csv',
    'comparison-results.csv',
    'recommendation-results.csv',
    'validation-results.csv',
    'invariants.csv',
    'explainability-summary.csv',
    'explainability-failures.csv',
    'failures.csv',
    'report.md',
    'manifest.json',
  ];
}

export function renderReport(run, options = {}) {
  const {
    generatedAt = 'unknown',
    environment = {},
    runDirName = 'experiments/results/<run>',
  } = options;

  const summary = run.summary;
  const results = run.results;
  const profiles = run.dataset.profiles;
  const rows = run.rows;

  const formulaRows = CORE_METRIC_KEYS.map((key) => {
    const entry = results.formula.byKey[key];
    return [
      key,
      counterText(entry?.baseline),
      counterText(entry?.scenario),
      counterText(entry?.overall),
      fmt(entry?.errors?.maxAbsError),
      fmt(entry?.errors?.meanAbsError),
      fmt(entry?.errors?.nullMismatches),
    ];
  });

  const goalRows = GOAL_FIELD_KEYS.map((key) => {
    const entry = results.goal.byKey[key];
    return [
      key,
      counterText(entry?.baseline),
      counterText(entry?.scenario),
      counterText(entry?.overall),
      fmt(entry?.errors?.maxAbsError),
      fmt(entry?.errors?.meanAbsError),
    ];
  });

  const recommendationRows = RECOMMENDATION_IDS.map((id) => {
    const entry = results.recommendation.byId[id];
    return [
      id,
      fmt(entry?.expected),
      fmt(entry?.actual),
      fmt(entry?.truePositives),
      fmt(entry?.falsePositives),
      fmt(entry?.falseNegatives),
      entry?.precision === null ? 'n/a' : fmt(entry?.precision),
      entry?.recall === null ? 'n/a' : fmt(entry?.recall),
      entry?.agreement === null ? 'n/a' : pct(entry?.agreement),
    ];
  });

  const comparisonMetricRows = COMPARISON_METRIC_DEFINITIONS.map(({ key }) => {
    const entry = results.comparison.byMetric[key];
    return [key, counterText(entry), fmt(entry?.failed)];
  });

  const comparisonGoalRows = Object.entries(results.comparison.goalByField).map(
    ([key, entry]) => [key, counterText(entry), fmt(entry?.failed)]
  );

  const invariantRows = results.invariants.byInvariant.map((entry) => [
    entry.id,
    fmt(entry.applicable),
    fmt(entry.passed),
    fmt(entry.failed),
    fmt(entry.notApplicable),
    entry.rate === null ? 'n/a' : pct(entry.rate),
    entry.assumption,
  ]);

  const explainCategoryRows = Object.entries(
    results.explainability.byCategory
  ).map(([category, entry]) => [
    category,
    counterText(entry.overall),
    counterText(entry.baseline),
    counterText(entry.scenario),
  ]);

  const archetypeRows = Object.entries(
    summary.profiles.archetypeCounts || {}
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([archetype, count]) => [archetype, count]);

  const scenarioRows = Object.entries(summary.scenarios.byName || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => [name, count]);

  const profileSchemaRows = [
    ['id', 'string', 'Stable synthetic profile identifier.'],
    ['source', 'string', 'Always "synthetic".'],
    ['archetype', 'string', 'Generating archetype or edge-case label.'],
    ['note', 'string', 'Human-readable description; not evidence.'],
    ['asOfDate', 'YYYY-MM-DD', 'Fixed projection date for this profile.'],
    ['monthlyIncome', 'number >= 0', 'Monthly income in INR.'],
    ['monthlyExpenses', 'number >= 0', 'Monthly living expenses in INR.'],
    ['accessibleSavings', 'number >= 0', 'Accessible savings in INR.'],
    ['goal', 'enum string', 'Validated goal category.'],
    ['emiPayments', 'number >= 0', 'Monthly EMI payments in INR.'],
    ['emiIncludedInExpenses', 'boolean', 'Whether EMI is already inside expenses.'],
    ['unexpectedExpense', 'number >= 0', 'One-time shock in INR.'],
    ['monthlySavingsCapacity', 'number >= 0 | null', 'Optional explicit goal contribution.'],
    ['targetAmount', 'number > 0 | null', 'Optional goal target.'],
    ['currentGoalSavings', 'number >= 0', 'Amount already saved for the goal.'],
    ['goalTimelineMonths', 'integer > 0 | null', 'Optional requested timeline.'],
  ];

  const boundaryRows = [
    [
      'Floating-point goal months',
      'syn-edge-goal-float-noise',
      'estimatedMonths',
      boundaryValue(
        findGoalRow(rows.goalResults, 'syn-edge-goal-float-noise', 'estimatedMonths')
      ),
    ],
    [
      'Month-end clamp (leap February)',
      'syn-edge-month-end-feb',
      'estimatedCompletionDate',
      boundaryValue(
        findGoalRow(
          rows.goalResults,
          'syn-edge-month-end-feb',
          'estimatedCompletionDate'
        )
      ),
    ],
    [
      'Month-end clamp (30-day month)',
      'syn-edge-month-end-sep',
      'estimatedCompletionDate',
      boundaryValue(
        findGoalRow(
          rows.goalResults,
          'syn-edge-month-end-sep',
          'estimatedCompletionDate'
        )
      ),
    ],
    [
      'Zero income denominator',
      'syn-edge-zero-income',
      'savingsRatePct',
      boundaryValue(
        findMetricRow(rows.metricResults, 'syn-edge-zero-income', 'savingsRatePct')
      ),
    ],
    [
      'Zero expenses denominator',
      'syn-edge-zero-expenses',
      'livingExpenseCoverageMonths',
      boundaryValue(
        findMetricRow(
          rows.metricResults,
          'syn-edge-zero-expenses',
          'livingExpenseCoverageMonths'
        )
      ),
    ],
    [
      'Zero outflows denominator',
      'syn-edge-zero-outflows-emi-included',
      'mandatoryOutflowCoverageMonths',
      boundaryValue(
        findMetricRow(
          rows.metricResults,
          'syn-edge-zero-outflows-emi-included',
          'mandatoryOutflowCoverageMonths'
        )
      ),
    ],
    [
      'Coverage exactly at threshold',
      'syn-edge-coverage-exactly-3',
      'low_mandatory_coverage',
      boundaryValue(
        findRecommendationRow(
          rows.recommendationResults,
          'syn-edge-coverage-exactly-3',
          'low_mandatory_coverage'
        )
      ),
    ],
    [
      'Coverage just below threshold',
      'syn-edge-coverage-below-3',
      'low_mandatory_coverage',
      boundaryValue(
        findRecommendationRow(
          rows.recommendationResults,
          'syn-edge-coverage-below-3',
          'low_mandatory_coverage'
        )
      ),
    ],
    [
      'EMI exactly at threshold',
      'syn-edge-emi-exactly-40',
      'high_emi_burden',
      boundaryValue(
        findRecommendationRow(
          rows.recommendationResults,
          'syn-edge-emi-exactly-40',
          'high_emi_burden'
        )
      ),
    ],
    [
      'EMI just above threshold',
      'syn-edge-emi-above-40',
      'high_emi_burden',
      boundaryValue(
        findRecommendationRow(
          rows.recommendationResults,
          'syn-edge-emi-above-40',
          'high_emi_burden'
        )
      ),
    ],
  ];

  const dependencyRows = Object.entries(environment.dependencies || {}).map(
    ([name, version]) => [name, version]
  );

  return `# WealthGenie Phase 4 - Reproducible Research Evaluation

> **Generated from an actual local execution.** Generated at: ${generatedAt}.
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
\`backend/src/utils/financialTwin.js\` - \`calculateTwin\`, \`buildTwinPreview\`,
\`compareTwinResults\`, input validation, goal projection, recommendation rules,
and explanation payloads - using an independent reference implementation in
\`experiments/lib/reference.js\`.

**Not evaluated:** real-world predictive accuracy, investment returns, user
trust, comprehension, financial literacy, the hosted Supabase deployment, or
the Global Findex experiment. No user study was conducted. No ML model was
trained or changed. The Findex dataset, preprocessing, models, and results were
not modified.

## 3. Environment

${table(
  ['Item', 'Value'],
  [
    ['Node.js', environment.node ?? 'unknown'],
    ['npm', environment.npm ?? 'unknown'],
    ['Platform', environment.platform ?? 'unknown'],
    ['Architecture', environment.arch ?? 'unknown'],
    ['OS release', environment.osRelease ?? 'unknown'],
    ['Experiment dependencies', 'none beyond the repository runtime'],
    ...dependencyRows,
  ]
)}

## 4. Reproducibility parameters

${table(
  ['Parameter', 'Value'],
  [
    ['Experiment version', run.meta.experimentVersion],
    ['Dataset schema version', run.dataset.schemaVersion],
    ['Random seed', run.config.seed],
    ['Requested random profiles', run.config.profiles],
    ['Include deterministic edge cases', run.config.includeEdgeCases],
    ['Default as-of date', run.config.asOfDate],
    ['Low mandatory-outflow coverage threshold', run.config.thresholds.lowMandatoryCoverageMonths],
    ['High EMI burden threshold (%)', run.config.thresholds.highEmiBurdenPct],
    ['Synthetic only', run.meta.syntheticOnly],
    ['Real data used', run.meta.realData],
  ]
)}

### Dataset and scenario counts

${table(
  ['Count', 'Value'],
  [
    ['Requested random profiles', summary.profiles.requestedRandomProfiles],
    ['Random profiles generated', summary.profiles.randomProfiles],
    ['Deterministic edge-case profiles', summary.profiles.edgeCaseProfiles],
    ['Total profiles', summary.profiles.totalProfiles],
    ['Baseline results evaluated', summary.results.baselineResults],
    ['Scenario results evaluated', summary.results.scenarioResults],
    ['Total results evaluated', summary.results.totalResults],
    ['Results with a goal target', summary.results.withTarget],
    ['Results without a goal target', summary.results.withoutTarget],
    ['Results with goal achieved', summary.results.goalAchieved],
    ['Results with unreachable goal', summary.results.unreachable],
    ['Month-end as-of results with positive months', summary.results.monthEndAsOf],
    ['Floating-point boundary results', summary.results.floatingPoint],
  ]
)}

### Profiles by archetype

${table(['Archetype', 'Profiles'], archetypeRows)}

### Scenario cases by name

${table(['Scenario', 'Cases'], scenarioRows)}

## 5. Dataset schema

Every profile is generated locally from the seeded PRNG and the documented
archetypes. Edge cases are always included unless \`includeEdgeCases\` is false.
The synthetic dataset is stored separately from \`data/processed/findex_resilience.csv\`
and is never merged with it.

${table(['Field', 'Type', 'Description'], profileSchemaRows)}

## 6. Metric definitions, formulas, and denominators

| Measure | Definition / formula | Denominator | Limitation |
| --- | --- | --- | --- |
| Formula correctness | One assertion per core metric: engine value equals independent reference value. Core metrics: ${CORE_METRIC_KEYS.join(', ')}. | 14 x ${summary.results.totalResults} = ${results.formula.overall.total} assertions | The reference is a second implementation by the same project, not an external oracle. |
| Alias correctness | \`expenseCoverageMonths\` equals \`livingExpenseCoverageMonths\`. | ${results.formulaAlias.total} results | Compatibility alias only. |
| Goal correctness | One assertion per goal field: ${GOAL_FIELD_KEYS.join(', ')}. | 11 x ${summary.results.totalResults} = ${results.goal.overall.total} assertions | Assumes constant contributions and no returns. |
| Goal context | The engine uses the fixed as-of date for both the result and the goal projection. | ${results.goalContext.overall.total} results | Does not validate time-zone behaviour beyond the fixed date. |
| Recommendation exact-set agreement | Engine recommendation ID set equals the reference rule set. | ${results.recommendation.exact.overall.total} results | A set match does not prove the recommendation is financially optimal. |
| Recommendation per-decision agreement | For each of ${RECOMMENDATION_IDS.length} recommendation IDs, expected presence equals actual presence. | ${RECOMMENDATION_IDS.length} x ${summary.results.totalResults} = ${results.recommendation.decisions.overall.total} decisions | Rare triggers can have high agreement but low positive predictive value. |
| Recommendation severity | Displayed severity equals the documented severity for that ID. | ${results.recommendation.severity.overall.total} displayed recommendations | Severity is a fixed mapping, not a calibrated risk score. |
| Comparison metric correctness | For each of 13 comparison metrics, baseline, scenario, difference, percentage change, and percentage-point difference match the reference. | 13 x 5 x ${summary.scenarios.totalCases} = ${Object.values(results.comparison.byMetric).reduce((sum, item) => sum + item.total, 0)} assertions | Percentage change is undefined when the baseline is zero. |
| Goal comparison correctness | Goal comparison fields match the reference, including completion-date direction. | ${Object.values(results.comparison.goalByField).reduce((sum, item) => sum + item.total, 0)} assertions | Direction is based on projected months, not calendar-day differences. |
| Comparison recommendation diff | Added, resolved, unchanged, and severity-changed sets match the reference. | 4 x ${summary.scenarios.totalCases} = ${results.comparison.recommendations.total} assertions | Only IDs and severity are compared. |
| Baseline consistency in preview | \`buildTwinPreview.baseline\` equals a separately calculated baseline. | ${results.comparison.baselineConsistency.total} scenarios | Catches preview/baseline drift, not formula errors already covered above. |
| Comparison overall | Union of the four comparison families above. | ${results.comparison.overall.total} assertions | The overall rate includes metric, goal, recommendation-diff, and baseline-consistency checks. |
| Determinism | Repeated calls with identical inputs produce identical serialized results. | ${results.determinism.overall.total} repeated cases (${results.determinism.baseline.total} baseline + ${results.determinism.scenario.total} scenario) | Same-process determinism only; not cross-version. |
| Validation rejection | Deliberately invalid inputs are rejected with a matching, non-empty message. | ${results.validation.invalid.total} invalid cases | A finite adversarial suite, not a proof of security. |
| Validation acceptance | Deliberately valid inputs are accepted. | ${results.validation.valid.total} valid cases | Guards against over-rejection only. |
| Directional invariants | Seven controlled one-input changes satisfy their documented direction. | ${results.invariants.overall.applicable} applicable checks (${results.invariants.overall.notApplicable} N/A) | Mathematical properties of the model, not evidence of real-world improvement. |
| Explainability coverage | Applicable displayed metrics, goal fields, and recommendations contain the required explanation fields. | ${results.explainability.overall.total} applicable checks | Presence/consistency, not user comprehension or trust. |

## 7. Results

### 7.1 Overall assertion results

${table(
  ['Measure', 'Passed / total', 'Rate'],
  [
    ['Formula correctness', counterText(results.formula.overall), counterRate(results.formula.overall)],
    ['Formula alias', counterText(results.formulaAlias), counterRate(results.formulaAlias)],
    ['Goal correctness', counterText(results.goal.overall), counterRate(results.goal.overall)],
    ['Goal context', counterText(results.goalContext.overall), counterRate(results.goalContext.overall)],
    ['Recommendation exact set', counterText(results.recommendation.exact.overall), counterRate(results.recommendation.exact.overall)],
    ['Recommendation decisions', counterText(results.recommendation.decisions.overall), counterRate(results.recommendation.decisions.overall)],
    ['Recommendation severity', counterText(results.recommendation.severity.overall), counterRate(results.recommendation.severity.overall)],
    ['Comparison correctness', counterText(results.comparison.overall), counterRate(results.comparison.overall)],
    ['Determinism', counterText(results.determinism.overall), counterRate(results.determinism.overall)],
    ['Validation (invalid)', `${results.validation.invalid.passed}/${results.validation.invalid.total}`, pct(results.validation.invalid.passRate)],
    ['Validation (valid)', `${results.validation.valid.accepted}/${results.validation.valid.total}`, pct(results.validation.valid.acceptanceRate)],
    ['Directional invariants', counterText(results.invariants.overall), counterRate(results.invariants.overall)],
    ['Explainability coverage', counterText(results.explainability.overall), counterRate(results.explainability.overall)],
  ]
)}

### 7.2 Formula correctness by metric

${table(
  [
    'Metric',
    'Baseline',
    'Scenario',
    'Overall',
    'Max abs error',
    'Mean abs error',
    'Null mismatches',
  ],
  formulaRows
)}

### 7.3 Goal projection correctness by field

${table(
  ['Field', 'Baseline', 'Scenario', 'Overall', 'Max abs error', 'Mean abs error'],
  goalRows
)}

### 7.4 Recommendation trigger agreement

**Exact-set agreement:** ${counterText(results.recommendation.exact.overall)}.
**Per-decision agreement:** ${counterText(results.recommendation.decisions.overall)}.

${table(
  [
    'Recommendation ID',
    'Expected present',
    'Actual present',
    'TP',
    'FP',
    'FN',
    'Precision',
    'Recall',
    'Agreement',
  ],
  recommendationRows
)}

### 7.5 Scenario comparison correctness

**Overall comparison:** ${counterText(results.comparison.overall)}.

${table(['Comparison metric', 'Passed / total', 'Failures'], comparisonMetricRows)}

**Goal comparison:** ${counterText(results.comparison.goal)}.

${table(['Goal comparison field', 'Passed / total', 'Failures'], comparisonGoalRows)}

**Recommendation diff:** ${counterText(results.comparison.recommendations)}.
**Preview baseline consistency:** ${counterText(results.comparison.baselineConsistency)}.

### 7.6 Input validation and boundary robustness

${table(
  ['Measure', 'Value'],
  [
    ['Invalid cases rejected', `${results.validation.invalid.rejected}/${results.validation.invalid.total} (${pct(results.validation.invalid.rejectionRate)})`],
    ['Invalid cases with matching message', `${results.validation.invalid.correctMessage}/${results.validation.invalid.total} (${pct(results.validation.invalid.correctMessageRate)})`],
    ['Invalid cases fully passing', `${results.validation.invalid.passed}/${results.validation.invalid.total} (${pct(results.validation.invalid.passRate)})`],
    ['Valid cases accepted', `${results.validation.valid.accepted}/${results.validation.valid.total} (${pct(results.validation.valid.acceptanceRate)})`],
  ]
)}

Selected boundary checks from this run:

${table(['Boundary', 'Case', 'Field/decision', 'Actual result'], boundaryRows)}

### 7.7 Determinism

${table(
  ['Scope', 'Passed / total', 'Rate'],
  [
    ['Baseline repeats', counterText(results.determinism.baseline), counterRate(results.determinism.baseline)],
    ['Scenario repeats', counterText(results.determinism.scenario), counterRate(results.determinism.scenario)],
    ['Overall', counterText(results.determinism.overall), counterRate(results.determinism.overall)],
  ]
)}

### 7.8 Directional invariants

These checks hold under the stated assumptions: one input changes at a time by a
non-negative amount, all other inputs and the fixed as-of date stay constant,
and no display rounding is applied. They are mathematical properties of the
implemented model, not evidence of real-world financial improvement.

${table(
  [
    'Invariant',
    'Applicable',
    'Passed',
    'Failed',
    'N/A',
    'Rate',
    'Assumption',
  ],
  invariantRows
)}

### 7.9 Explainability coverage

**Overall explainability coverage:** ${counterText(results.explainability.overall)}.

${table(
  ['Category', 'Overall', 'Baseline', 'Scenario'],
  explainCategoryRows
)}

The denominator counts only checks applicable to the displayed result. For
example, a recommendation check is counted only when that recommendation is
displayed. Empty assumption arrays are accepted as "no additional assumption
stated"; this checklist verifies presence and consistency, not the quality or
persuasiveness of the wording. Per-check coverage for every check is exported
in \`explainability-summary.csv\`; failed checks are exported in
\`explainability-failures.csv\`.

### 7.10 Failed cases and error analysis

${failureSummary(run)}

${failureExamples(run)}

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
   \`1e-9\`; this is appropriate for the tested formulas but would hide errors
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

\`\`\`bash
npm install
npm test
npm run experiment
npm run build:frontend
\`\`\`

To regenerate this report into \`docs/RESEARCH_EVALUATION.md\`:

\`\`\`bash
npm run experiment:publish
\`\`\`

\`npm run experiment\` uses the fixed seed and profile count recorded above. To
override them explicitly in bash, cmd, or Git Bash:

\`\`\`bash
npm run experiment -- --seed ${run.config.seed} --profiles ${run.config.profiles}
\`\`\`

The dedicated \`experiment:publish\` script avoids shell-specific argument
forwarding issues (for example, Windows PowerShell can drop forwarded flags).
The equivalent direct command is \`node experiments/run.js --publish-doc\`.

The default command uses the fixed seed and fixed as-of date recorded above.
Every run writes to a new timestamped directory under \`experiments/results/\`
and never overwrites an earlier run. To reproduce exactly, keep the seed,
profile count, edge-case flag, as-of date, thresholds, and Node.js version
unchanged.

Run directory for this report: \`${runDirName}\`.

## Appendix - Artifact inventory

${table(['File', 'Contents'], artifactList().map((file) => [file, file === 'run.json' ? 'Summary, config, environment metadata, failures' : file === 'dataset.json' ? 'Exact generated profiles and dataset metadata' : file === 'manifest.json' ? 'SHA-256 checksums and sizes for every artifact' : file === 'report.md' ? 'This report' : 'Machine-readable experiment rows']))}
`;
}
