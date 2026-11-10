"""
WealthGenie — historical NAV metrics pipeline.

Reads wealthgenie-datasets/nav_history.parquet once and produces, per scheme:
  data/processed/fund_nav_metrics.csv

Metrics (computed only when the evidence exists; never invented):
  - obs_count, first/last NAV date, span, NAV freshness (days since last NAV)
  - 1y simple return (calendar-year window, span-sufficiency checked)
  - 3y / 5y annualized returns (CAGR over an actual observed window)
  - annualized volatility: log-return std annualized by the *actual* average
    observation spacing (robust for daily and weekly NAV series alike)
  - maximum drawdown over the available series
  - positive rolling-year fraction (performance consistency proxy)
  - insufficiency flags listing which horizon(s) lacked sufficient history

Sufficiency rule (documented, deterministic):
  a horizon window is valid when the actual date span from the first
  observation at/after (last_date - H years) to last_date is >= 97% of the
  window AND the window contains >= 12 observations. Missing dates and stale
  series therefore yield explicit nulls + flags, never estimates.
"""
from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
PARQUET = ROOT / "wealthgenie-datasets" / "nav_history.parquet"
OUT = ROOT / "data" / "processed" / "fund_nav_metrics.csv"
MANIFEST = ROOT / "data" / "processed" / "fund_nav_metrics_manifest.json"

HORIZONS = {"one_year": 1, "three_year": 3, "five_year": 5}
MIN_OBS_IN_WINDOW = 12
SPAN_SUFFICIENCY = 0.97


def _get_arrow_column(table, name: str) -> np.ndarray:
    column = table.column(name)
    return column.to_numpy(zero_copy_only=False)


def process_series(dates: np.ndarray, nav: np.ndarray) -> dict:
    """dates: datetime64[D] ascending, no NaN; nav: float64 ascending."""
    out = {"obs_count": len(nav)}
    last_date = dates[-1]
    out["first_nav_date"] = str(dates[0])
    out["last_nav_date"] = str(last_date)
    out["freshness_days"] = int((np.datetime64(date.today().isoformat(), "D") - last_date).astype(int))
    out["span_days"] = int((last_date - dates[0]).astype(int))

    if not np.isfinite(nav).all() or (nav <= 0).any():
        out["flag"] = "invalid_nav_values_present"
        return out
    out["last_nav_value"] = round(float(nav[-1]), 4)

    # ── Horizon returns ──────────────────────────────────────────────────────
    for label, years in HORIZONS.items():
        window_start = last_date - np.timedelta64(int(round(years * 365.25)), "D")
        start_idx = int(np.searchsorted(dates, window_start, side="left"))
        if start_idx == len(dates):  # nothing observed in the window
            out[f"return_{label}"] = None
            out[f"window_start_date_{label}"] = None
            continue
        window_dates = dates[start_idx:]
        span = int((last_date - window_dates[0]).astype(int))
        target = int(round(years * 365.25))
        sufficient = (span / max(target, 1)) >= SPAN_SUFFICIENCY and len(window_dates) >= MIN_OBS_IN_WINDOW
        out[f"window_start_date_{label}"] = str(window_dates[0])
        out[f"window_span_days_{label}"] = span
        if not sufficient:
            out[f"return_{label}"] = None
            out.setdefault("insufficient_horizons", []).append(label)
            continue
        growth = float(nav[-1]) / float(nav[start_idx])
        if years == 1:
            out[f"return_{label}"] = round(growth - 1, 6)
        else:
            out[f"return_{label}"] = round(growth ** (1.0 / years) - 1, 6)

    # ── Volatility (log returns, annualized by real average spacing) ─────────
    gaps = np.diff(dates).astype(int)
    log_returns = np.diff(np.log(nav))
    if len(log_returns) >= MIN_OBS_IN_WINDOW:
        # ignore observation gaps > 15 days in the volatility estimate
        usable = gaps <= 15
        if usable.sum() >= MIN_OBS_IN_WINDOW:
            spacing = float(np.median(gaps))
            active_days_per_year = 365.25 / spacing
            vol = float(np.std(log_returns[usable], ddof=1) * np.sqrt(active_days_per_year))
            out["volatility_annualized"] = round(vol, 6)
            out["mean_observation_gap_days"] = round(spacing, 2)

    # ── Maximum drawdown (whole series) ──────────────────────────────────────
    if len(nav) >= MIN_OBS_IN_WINDOW:
        peaks = np.maximum.accumulate(nav)
        drawdown = np.max((peaks - nav) / peaks)
        out["max_drawdown"] = round(float(drawdown), 6)

    # ── Positive rolling-year fraction (consistency proxy) ───────────────────
    spacing = float(np.median(gaps)) if len(gaps) else 7.0
    per_year = max(1, int(round(365.25 / spacing)))
    if len(nav) - per_year >= MIN_OBS_IN_WINDOW:
        yearly_moves = nav[per_year:] / nav[:-per_year] - 1
        out["positive_rolling_year_fraction"] = round(float((yearly_moves > 0).mean()), 6)

    return out


def main() -> int:
    print("Reading NAV parquet (single pass over 3 columns)…", flush=True)
    table = pq.read_table(PARQUET, columns=["scheme_code", "date", "nav"])

    codes = _get_arrow_column(table, "scheme_code").astype(np.int32)
    nav = _get_arrow_column(table, "nav").astype(np.float64)

    dates_raw = _get_arrow_column(table, "date")
    dates = pd.to_datetime(pd.Series(dates_raw), errors="raise", format="%Y-%m-%d").values.astype(
        "datetime64[D]"
    )

    print(f"rows={len(codes):,}; sorting by (scheme_code, date)…", flush=True)
    order = np.lexsort((dates, codes))
    codes_s, dates_s, nav_s = codes[order], dates[order], nav[order]

    boundaries = np.unique(codes_s, return_index=True)[1]
    boundaries = np.append(boundaries, len(codes_s))
    bounds = list(zip(boundaries[:-1], boundaries[1:]))

    print(f"funds with NAV history: {len(bounds):,}; computing metrics…", flush=True)
    rows = []
    for start, end in bounds:
        code = int(codes_s[start])
        metrics = process_series(dates_s[start:end].copy(), nav_s[start:end].copy())
        metrics["scheme_code"] = code
        rows.append(metrics)

    columns = [
        "scheme_code", "obs_count", "first_nav_date", "last_nav_date", "span_days",
        "freshness_days", "last_nav_value", "return_one_year", "return_three_year",
        "return_five_year",
        "volatility_annualized", "max_drawdown", "positive_rolling_year_fraction",
        "mean_observation_gap_days", "window_start_date_one_year", "window_start_date_three_year",
        "window_start_date_five_year", "insufficient_horizons",
        "window_span_days_one_year", "window_span_days_three_year", "window_span_days_five_year",
        "flag",
    ]
    frame = pd.DataFrame(rows)
    for col in columns:
        if col not in frame:
            frame[col] = None
    frame[columns].to_csv(OUT, index=False)

    manifest = {
        "source": str(PARQUET.relative_to(ROOT)),
        "nav_series_rows": int(len(codes)),
        "funds_processed": int(len(rows)),
        "funds_with_any_nav_history": int(frame.dropna(subset=["last_nav_date"]).shape[0]),
        "nav_covrage_note": "nav columns transformed decimal128->float; no imputation",
        "sufficiency_rule": {
            "min_obs_in_window": MIN_OBS_IN_WINDOW,
            "min_span_fraction": SPAN_SUFFICIENCY,
        },
        "output": {
            "rows": int(len(frame)),
            "columns": columns,
            "reproducibility": "Single sorted pass; no RNG; deterministic.",
            "command": "python wealthgenie-datasets/build_nav_metrics.py",
        },
        "population_rates": {
            "return_one_year": int(frame.return_one_year.notna().sum()),
            "return_three_year": int(frame.return_three_year.notna().sum()),
            "return_five_year": int(frame.return_five_year.notna().sum()),
            "volatility_annualized": int(frame.volatility_annualized.notna().sum()),
            "max_drawdown": int(frame.max_drawdown.notna().sum()),
            "positive_rolling_year_fraction": int(frame.positive_rolling_year_fraction.notna().sum()),
        },
        "freshness": {
            "median_freshness_days": float(frame.freshness_days.median()) if len(frame) else None,
            "max_freshness_days": int(frame.freshness_days.max()) if len(frame) else None,
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(manifest["population_rates"], indent=2))
    print(f"written: {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
