# Recommendation System — Evaluation Report (measured)

Generated: 2026-11-02T20:13:19.118Z

All numbers below were **measured by this run** — nothing is estimated or asserted without execution evidence.

## API latency (12 requests/profile, warm catalog excluded in p-values)

| Profile | Cold (ms) | p50 | p95 | mean |
|---|---|---|---|---|
| conservative | 139 | 27 | 139 | 39.3 |
| moderate | 64 | 43 | 64 | 44.3 |
| aggressive | 44 | 54 | 98 | 58.3 |

## Determinism

- conservative: byte-identical payloads across runs → YES (26085 bytes)
- moderate: byte-identical payloads across runs → YES (31543 bytes)
- aggressive: byte-identical payloads across runs → YES (31517 bytes)

## Eligibility-constraint safety

- Recommendations re-validated: **216** across all profiles and requests.
- Constraint violations: **0** (must be 0).

## Test suite (actual `node --test` output)

- Total tests: **448**, passed: **448**, failed: **0** across 101 suites.

## Data pipeline evidence

- Merge: 38495 rows, 11417 matched with details, 27078 unmatched preserved, row multiplication 0.
- NAV metrics: 38475 funds from 3,77,03,595 NAV observations.
  Population: 1Y 29888, 3Y 19968, 5Y 7788, volatility 34960, drawdown 34993.
- Holdings: 288 snapshots from 22236 rows; name-matched 24/24 funds.
- Engine catalog: 8885 active funds of 38495; with Riskometer 8684, with TER 7999, with NAV metrics 8885, 1Y history 7769.

## Documented limitations

- Real-data check: NAV decimal precision on liquid/overnight funds inflates some volatility estimates (rounding of ₹-denominated NAV steps). Volatility can therefore penalize, but never reward, a fund; the artifact is documented rather than smoothed away.
- Holdings coverage: only 24 funds disclose portfolio holdings — concentration snapshot is enrichment only, never scored.
- Approximately 70% of merged rows carry no Riskometer: they are merged catalog rows without details disclosure (mostly inactive legacy schemes). They are excluded by the engine, flagged in the quality report, never imputed.
- Collaborative filtering / ML training was deliberately not deployed: the repository holds no verified user-fund interaction dataset. The system remains fully deterministic and explainable.
