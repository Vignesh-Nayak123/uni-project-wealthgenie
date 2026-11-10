# ML Research Area — Isolated Experiments

This directory contains **research experiments** that are intentionally isolated from the live WealthGenie application. They are preserved for auditability and future reference, but they are **not imported, executed, or required** by any production code path.

## Findex Resilience Experiment

### Purpose
This experiment attempted to classify Global Findex survey respondents' reported difficulty obtaining emergency money (`fin24a`) using demographic and financial feature variables. It is a **survey-response classifier**, not an individual financial health predictor.

### Why It Is Not Used by the Application
- The model predicts **reported difficulty** on a population survey, not an individual user's actual financial health, investment suitability, or portfolio allocation.
- The features (age quintile, education, urbanicity, saved/borrowed flags) are coarse survey categories that do not map to the per-user financial inputs the platform collects.
- The target `fin24a` is a 3-point ordinal survey response, which cannot be translated into a personalized recommendation.

### Files
| File | Purpose |
|------|---------|
| `prepare_dataset.py` | Extracts features + target from raw Findex CSV into `data/processed/findex_resilience.csv`. |
| `train.py` | Trains and evaluates Logistic Regression / Random Forest classifiers on the processed dataset. |
| `inspect_dataset.py` | Inspects raw dataset schema, missing values, and target distribution. |
| `check_features.py` | Prints unique values and counts for candidate feature columns. |
| `check_target.py` | Cross-tabulates `fin24a` against `fin24` and `inc_q`. |
| `check_codebook.py` | Cross-tabulates `fin24a` against all candidate features. |

### Datasets
- **Raw**: `data/Findex_Microdata_2025_updateIndia.csv` — kept out of Git via `.gitignore` (`data/*.csv`).
- **Processed**: `data/processed/findex_resilience.csv` — also kept out of Git via `.gitignore` (`data/*.csv`).

### Status
- **Not retrained or tuned** as part of this task.
- **Not connected** to any live recommendation flow.
- **Preserved** in place for auditability.

### Running the Experiment (Optional, Manual)
```bash
python ml/prepare_dataset.py   # requires data/Findex_Microdata_2025_updateIndia.csv
python ml/train.py             # trains and evaluates models
```