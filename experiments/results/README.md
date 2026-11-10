# Experiment Results

Each subdirectory is one immutable run produced by `npm run experiment`. Run
directories are timestamped and seed-based; a second run with the same timestamp
gets a `-02`, `-03`, ... suffix rather than overwriting an earlier run.

Generated run directories are intentionally git-ignored. This README is kept so
the directory exists in a clean checkout.

## Contents

- `run.json` — config, environment, summaries, failures, artifact list.
- `dataset.json` — exact generated synthetic profiles and metadata.
- `*.csv` — per-result, per-scenario, validation, invariant, and explainability
  rows.
- `report.md` — Markdown research report for the run.
- `manifest.json` — SHA-256 checksums and byte sizes for every artifact.

## Verify a run

From the repository root:

```bash
npm run experiment:verify -- experiments/results/<run>
```

A nonzero exit code means a file is missing or its checksum no longer matches the
manifest.

## Do not edit generated runs

Do not modify files inside a completed run directory. If a new configuration or
code change is needed, run the experiment again; the new run will use a new
directory. This keeps earlier results auditable.

All data in these runs is synthetic and must not be presented as real people or
real-world evidence. See `docs/EXPERIMENT_PROTOCOL.md` for the protocol and
`experiments/README.md` for usage.
