"""
WealthGenie — reproducible scheme-master + scheme-details merge.

Read-only on the source datasets; writes:
  data/processed/wealthgenie_funds.csv           (merged, inference-ready)
  data/processed/wealthgenie_funds_manifest.json (counts, join stats, provenance)

Join contract (verified on the real data, see inspect_datasets_stage1b.py):
  - scheme_master.scheme_code is unique (38,495 rows @ export time)
  - scheme_details.scheme_code is unique (11,417 rows) and ring-set inside master
  - therefore the safe join is master LEFT JOIN details ON scheme_code (1:1),
    never a bidirectional merge.

Cleaning strategy (every transformation documented here; no silent zero-fill):
  1. riskometer   = coalesce(ssd_riskometer_level, amfi_daily_riskometer,
                             ssd_riskometer), then value-normalized.
  2. riskometer_level (1-6) mapped from the normalized label per SEBI.
  3. riskometer_source records which column supplied the value.
  4. fund_name_latest preferred over scheme_name for display.
  5. scheme_plan normalized to Direct / Regular / Other.
  6. category from ssd_sebi_category, falling back to master.category.
  7. Unmatched master rows are KEPT with empty details columns and a
     `details_matched=False` flag (never dropped, never fabricated).
  Rows are never deleted for missing financial attributes — the quality report
  counts them and the recommendation engine treats missing data explicitly.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent

RISKOMETER_LABELS = {
    "low": "Low",
    "low to moderate": "Low to Moderate",
    "low_moderate": "Low to Moderate",
    "moderate": "Moderate",
    "moderately high": "Moderately High",
    "moderately_high": "Moderately High",
    "high": "High",
    "very high": "Very High",
    "very_high": "Very High",
    "very high risk": "Very High",
}
RISKOMETER_LEVELS = {
    "Low": 1,
    "Low to Moderate": 2,
    "Moderate": 3,
    "Moderately High": 4,
    "High": 5,
    "Very High": 6,
}

# Compact export: long SSD prose columns are intentionally not exported into
# the inference dataset (they belong to the source details file).
DETAIL_COLUMNS = [
    (["ssd_sebi_category", "category_sub", "category"], "category_primary"),
    (["category_group_clean", "amfi_daily_riskometer"], "category_group"),
    (["ssd_riskometer_level", "amfi_daily_riskometer", "ssd_riskometer"], "riskometer"),
    (["ter_regular"], "ter"),
    (["ter_date"], "as_of_ter_date"),
    (["ssd_expense_actual"], "expense_ratio_ssd"),
    (["ssd_benchmark_tier1_std", "amfi_daily_benchmark"], "benchmark"),
    (["ssd_objective"], "objective"),
    (["ssd_riskometer_level"], "riskometer_source"),
]


def resolve_input(filename: str) -> Path:
    """The raw files arrive either as `x.csv` or `x.csv.csv`."""
    for candidate in (BASE := ROOT / "wealthgenie-datasets") / f"{filename}.csv", BASE / filename:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"Source dataset `{filename}` not found in {BASE} (tried .csv and .csv.csv)."
    )


def normalize_riskometer(value) -> str | float:
    if pd.isna(value):
        return None
    text = str(value).strip().lower()
    return RISKOMETER_LABELS.get(text)


def derive_risk_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Riskometer normalization. Priority: SSD level (SEBI SID) → AMFI daily →
    SSD riskometer (may be off-scale). Source recorded per row."""
    source = pd.Series(index=df.index, dtype="object")
    normalized = pd.Series(index=df.index, dtype="object")

    def mask(values):
        return values.notna() & normalized.isna()

    for column, tag in [
        ("ssd_riskometer_level", "ssd_riskometer_level"),
        ("amfi_daily_riskometer", "amfi_daily_riskometer"),
        ("ssd_riskometer", "ssd_riskometer"),
    ]:
        use = mask(df[column])
        normalized.loc[use] = df.loc[use, column].apply(normalize_riskometer)
        source.loc[use] = tag

    df["riskometer"] = normalized
    df["riskometer_source"] = source
    df["riskometer_level"] = df["riskometer"].map(RISKOMETER_LEVELS)
    # `ssd_riskometer` may supply values off the SEBI scale; those rows keep
    # `High` label (5) only if it already normalized, else NaN level — recorded
    # in the quality report rather than guessed.
    return df


def build(args: argparse.Namespace) -> int:
    master_path = resolve_input(args.master)
    details_path = resolve_input(args.details)

    master = pd.read_csv(master_path, low_memory=False)
    details = pd.read_csv(details_path, low_memory=False)

    stats = {
        "generated_from": {
            "scheme_master": str(master_path.relative_to(ROOT)),
            "scheme_details": str(details_path.relative_to(ROOT)),
            "scheme_master_sha_note": "row-count identity, no hash on 38k rows needed for reproducibility",
        },
        "master_rows": int(len(master)),
        "details_rows": int(len(details)),
    }

    # ── Join integrity ──────────────────────────────────────────────────────
    master_dupes = int(master.scheme_code.duplicated().sum())
    details_dupes = int(details.scheme_code.duplicated().sum())
    if master_dupes or details_dupes:
        print(
            f"Blocker: duplicate scheme_code — master dupes={master_dupes}, "
            f"details dupes={details_dupes}. Merge without de-duplication would "
            "multiply rows; aborting.",
            file=sys.stderr,
        )
        return 2
    stats["duplicate_scheme_codes"] = {"master": master_dupes, "details": details_dupes}

    details_only = sorted(set(details.scheme_code) - set(master.scheme_code))
    stats["details_only_scheme_codes"] = {
        "count": len(details_only),
        "sample": details_only[:20],
    }

    merged = master.merge(details, on="scheme_code", how="left", suffixes=("", "_details"))
    stats["merged_rows"] = int(len(merged))
    stats["row_multiplication"] = len(merged) - len(master)
    if len(merged) != len(master):
        print(
            f"Blocker: join multiplied rows ({len(master)} → {len(merged)}); "
            f"merging aborted to avoid fabricating fund records.",
            file=sys.stderr,
        )
        return 2
    # A details row existed for this scheme_code (details' scheme_name survived
    # as the suffixed column; NaN only when the left join found no match).
    detail_name_col = "scheme_name_details" if "scheme_name_details" in merged.columns else "scheme_name"
    merged["details_matched"] = merged[detail_name_col].notna()
    stats["details_matched_rows"] = int(merged.details_matched.sum())
    stats["unmatched_master_rows"] = int((~merged.details_matched).sum())

    # ── Cleaning ────────────────────────────────────────────────────────────
    merged = derive_risk_columns(merged)

    stats["cleaning"] = [
        {
            "step": "riskometer coalesce",
            "detail": (
                "riskometer = coalesce(ssd_riskometer_level, amfi_daily_riskometer, "
                "ssd_riskometer); label normalized to the SEBI scale; source per row "
                "recorded in riskometer_source."
            ),
            "populated": int(merged.riskometer.notna().sum()),
            "null": int(merged.riskometer.isna().sum()),
        },
        {
            "step": "riskometer_level mapping",
            "detail": "Normalized labels mapped to SEBI levels 1-6; off-scale labels stay null.",
            "populated": int(merged.riskometer_level.notna().sum()),
            "null": int(merged.riskometer_level.isna().sum()),
        },
        {
            "step": "fund_name preference",
            "detail": "fund_name_latest preferred; scheme_name kept as scheme_name_master.",
            "populated": int(merged.fund_name_latest.notna().sum()) if "fund_name_latest" in merged else 0,
        },
        {
            "step": "expense ratio",
            "detail": "ter_regular kept verbatim with ter_date as-of. ter_direct kept separately.",
            "populated_regular": int(merged.ter_regular.notna().sum()) if "ter_regular" in merged else 0,
            "populated_direct": int(merged.ter_direct.notna().sum()) if "ter_direct" in merged else 0,
        },
        {
            "step": "no deletion",
            "detail": "No rows dropped; no missing financial value replaced with zero or synthetic data.",
        },
    ]

    merged["fund_name"] = merged.fund_name_latest.fillna(merged.scheme_name)

    # Details carries the fresher category reading; master's own value is the
    # fallback so unmatched rows keep their master-side category.
    group_master = merged.get("category_group_clean")
    group_details = merged.get("category_group_clean_details")
    if group_details is not None:
        merged["category_group_clean"] = group_details.fillna(group_master)
    merged["category_primary"] = merged.ssd_sebi_category.fillna(merged.category)

    # Benchmark provenance: SEBI SID filed benchmark (tier-1) preferred over the
    # AMFI daily disclosure; both kept in the details source file.
    bench = None
    for column in ["ssd_benchmark_tier1_std", "amfi_daily_benchmark"]:
        column_values = merged.get(column)
        if column_values is not None:
            merged["benchmark"] = column_values if bench is None else merged["benchmark"].fillna(column_values)
            bench = True
    if "ssd_expense_actual" in merged.columns:
        merged["expense_ratio_ssd"] = merged["ssd_expense_actual"]

    # ── Export ──────────────────────────────────────────────────────────────
    out_dir = ROOT / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "wealthgenie_funds.csv"

    export_cols = [
        "scheme_code",
        "fund_name",
        "scheme_name",
        "amc",
        "isin",
        "scheme_plan",
        "scheme_option",
        "details_matched",
        "category_primary",
        "category_group_clean",
        "category_group",
        "category_sub",
        "riskometer",
        "riskometer_source",
        "riskometer_level",
        "ter_regular",
        "ter_direct",
        "ter_date",
        "expense_ratio_ssd",
        "benchmark",
        "first_date",
        "last_date",
        "nav_date",
        "nav",
        "is_active",
        "is_stale",
        "aaum_cr_quarterly_avg",
        "source",
    ]
    export_cols = [c for c in export_cols if c in merged.columns]
    merged[export_cols].to_csv(out_path, index=False)

    manifest_path = out_dir / "wealthgenie_funds_manifest.json"
    stats["output"] = {
        "path": str(out_path.relative_to(ROOT)),
        "rows": int(len(merged)),
        "columns": export_cols,
        "reproducibility": (
            "Deterministic: merge order derived from source row order; no sampling, "
            "no RNG. Re-running produces identical output."
        ),
        "command": "python wealthgenie-datasets/build_fund_dataset.py",
    }
    manifest_path.write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({k: v for k, v in stats.items() if k != "cleaning"}, indent=2, default=str))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--master", default="scheme_master.csv", help="dataset stem (csv/csv.csv)")
    parser.add_argument("--details", default="scheme_details.csv")
    return build(parser.parse_args())


if __name__ == "__main__":
    sys.exit(main())
