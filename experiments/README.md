# Phase 4 — Reproducible Experiments

This directory contains the reproducible evaluation framework for the
deterministic WealthGenie assessment and Financial Digital Twin. It is a
research harness, not a production feature and not an ML experiment.

All profiles are **synthetic**. They are not real people, survey respondents,
or real-world evidence. The framework measures implementation consistency,
explainability coverage, and directional invariants; it does not measure
real-world predictive accuracy or user benefit.

## Quick start

From the repository root:

```bash
npm test
npm run experiment
```

The default run uses the fixed seed and as-of date in
`experiments/config/default.json`. It writes a new timestamped directory under
`experiments/results/`.

To reproduce a specific configuration:

```bash
npm run experiment -- --seed 20261027 --profiles 200
```

To also publish the Markdown report to `docs/RESEARCH_EVALUATION.md`:

```bash
npm run experiment:publish
```

The dedicated `experiment:publish` script avoids shell-specific `--` argument
forwarding issues (for example, Windows PowerShell can drop forwarded flags).
The equivalent direct command is `node experiments/run.js --publish-doc`.

To verify that a run's artifacts match its manifest:

```bash
npm run experiment:verify -- experiments/results/<run>
```

## Layout

```
experiments/
├── config/
│   ├── default.json          # Default seed, sample size, as-of date, thresholds
│   └── dataset-schema.json   # Documented dataset schema and coverage
├── lib/
│   ├── rng.js                # Dependency-free seeded PRNG
│   ├── reference.js          # Independent reference formulas
│   ├── dataset.js            # Seeded generator, edge cases, scenarios
│   ├── metrics.js            # Aggregation, equality, CSV helpers
│   ├── explainability.js     # Explainability checklist
│   ├── invariants.js         # Directional invariant evaluator
│   ├── validation.js         # Invalid and valid input cases
│   ├── runner.js             # Full experiment orchestration
│   ├── artifacts.js          # Run directory, CSV/JSON, manifest checksums
│   └── report.js             # Markdown report renderer
├── results/                  # Generated runs (git-ignored except this README)
└── run.js                    # CLI
```

The full protocol and metric definitions are in
`docs/EXPERIMENT_PROTOCOL.md`. The generated research report for a run is
`report.md` inside its run directory.

## Configuration

`experiments/config/default.json`:

| Field | Default | Notes |
| --- | --- | --- |
| `experimentVersion` | `1.0.0` | Stored in artifacts. |
| `seed` | `20261027` | Seeded `mulberry32` PRNG. |
| `profiles` | `200` | Number of seeded random profiles. |
| `includeEdgeCases` | `true` | Include 26 deterministic boundary profiles. |
| `asOfDate` | `2026-10-27` | Fixed so results do not depend on the wall clock. |
| `thresholds.lowMandatoryCoverageMonths` | `3` | Heuristic low-coverage threshold. |
| `thresholds.highEmiBurdenPct` | `40` | Heuristic high-EMI threshold. |

CLI overrides:

```bash
npm run experiment -- \
  --seed 20261027 \
  --profiles 200 \
  --as-of 2026-10-27 \
  --low-coverage 3 \
  --high-emi 40
```

Use `--no-edge-cases` to exclude the deterministic edge cases. Use
`--allow-failures` only when inspecting a deliberate regression; the default
exit code is nonzero when any assertion fails.

## What is evaluated

- **Formula correctness:** 14 core metrics against an independent reference.
- **Goal correctness:** 11 goal fields, including floating-point rounding and
  month-end date clamping.
- **Recommendation consistency:** exact-set and per-ID trigger agreement.
- **Scenario comparison:** 13 metrics × 5 comparison values, goal comparison,
  recommendation diff, and preview baseline consistency.
- **Validation:** 31 invalid and 5 valid input cases.
- **Determinism:** every baseline and scenario is repeated and compared by
  stable serialization.
- **Directional invariants:** seven one-input changes with explicit N/A rules.
- **Explainability coverage:** applicable checks for formulas, inputs, reasons,
  assumptions, and heuristic labels.

## Outputs

Each run directory contains:

| File | Contents |
| --- | --- |
| `run.json` | Config, environment, summaries, failures, artifact list. |
| `dataset.json` | Exact generated profiles and dataset metadata. |
| `profiles.csv` | One row per synthetic profile. |
| `scenario-cases.csv` | One row per scenario and its overrides. |
| `metric-results.csv` | Per-result, per-metric expected/actual/pass rows. |
| `goal-results.csv` | Per-result, per-goal-field expected/actual/pass rows. |
| `comparison-results.csv` | Compact per-scenario comparison summaries; failed fields are named. |
| `recommendation-results.csv` | Exact-set, per-ID decision, severity, and unknown-ID rows. |
| `validation-results.csv` | Invalid and valid input cases. |
| `invariants.csv` | One row per invariant per profile, including N/A. |
| `explainability-summary.csv` | Per-check coverage counts. |
| `explainability-failures.csv` | Stored explainability failures. |
| `failures.csv` | All stored failed assertions with expected/actual values. |
| `report.md` | Markdown research report generated from the run. |
| `manifest.json` | SHA-256 checksums and byte sizes for every artifact. |

Run directories are never overwritten. Re-running with the same timestamp
creates a `-02`, `-03`, ... suffix.

## Limits

- The reference is a second implementation by the same project, not an external
  mathematical oracle.
- The synthetic archetypes are hand-designed and are not a probability sample.
- The scenario suite is finite and mostly one-input-at-a-time.
- No investment returns, interest, inflation, taxes, borrowing, or asset sales
  are modelled.
- Explainability coverage is not evidence of improved trust or financial
  literacy; that requires a separate user study.
- No real-world predictive accuracy is claimed.

## Findex isolation

The Global Findex experiment in `ml/` and its data in
`data/processed/findex_resilience.csv` are unchanged. The synthetic profiles in
this directory are never merged into Findex data, and no Findex model, feature
set, preprocessing step, or result is modified by Phase 4.
