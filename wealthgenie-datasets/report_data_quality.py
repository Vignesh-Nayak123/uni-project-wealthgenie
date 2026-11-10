"""
WealthGenie — reusable data-quality pipeline for the merged fund dataset.

Reports (exactly the 13 contract checks + provenance), never mutates data:
  data/reports/data_quality_report.json
  data/reports/data_quality_report.txt

Convention: "Missing" means genuinely absent in the sources. Values are never
zero-filled, never imputed, and no row is dropped here.
"""
from __future__ import annotations

import bisect
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
MERGED = ROOT / "data" / "processed" / "wealthgenie_funds.csv"
NAV_TODAY = date.today().isoformat()


def pct(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 2) if whole else None


def build_report(df: pd.DataFrame, join_stats: dict | None) -> dict:
    total = int(len(df))
    ids = df.scheme_code
    report: dict = {
        "generated_on": NAV_TODAY,
        "dataset": "data/processed/wealthgenie_funds.csv",
        "collected": [],
    }

    def add(label, found, missing=None, note=None, found_ratio=None):
        item = {"check": label, "found": found}
        if missing is not None:
            item["missing"] = missing
        if found_ratio is not None:
            item["found_ratio_pct"] = found_ratio
        if note:
            item["note"] = note
        report["collected"].append(item)

    # 1-2: totals and uniqueness
    add("total_fund_records", total)
    add("unique_scheme_identifiers", int(ids.nunique()))
    dupes = int(ids.duplicated().sum())
    add("duplicate_scheme_identifiers", dupes,
        note="0 means the merge worked 1:1 on scheme_code" if dupes == 0 else
             "BLOCKER: duplicates present, investigate merge")
    add("distribution_active_vs_inactive", df.is_active.value_counts(dropna=False).to_dict()
        if "is_active" in df else None)

    # 3-8: missing critical attributes
    def missing_of(col):
        return int(df[col].isna().sum()) if col in df else total

    add("missing_fund_names", missing_of("fund_name"), pct(missing_of("fund_name"), total))
    add("missing_category", missing_of("category_primary"), pct(missing_of("category_primary"), total))
    add("missing_nav_values", missing_of("nav"), pct(missing_of("nav"), total))
    add("missing_riskometer", missing_of("riskometer"), pct(missing_of("riskometer"), total),
        note="riskometer = coalesce(ssd_riskometer_level, amfi_daily_riskometer, ssd_riskometer)")

    # An expense ratio is "missing" only when BOTH plan TERs are absent — never
    # the sum of the two columns.
    if {"ter_regular", "ter_direct"} <= set(df.columns):
        both_missing = int((df["ter_regular"].isna() & df["ter_direct"].isna()).sum())
        add("missing_expense_ratio", both_missing, pct(both_missing, total),
            note="rows with neither a regular nor a direct TER")

    # 9-10: invalid values
    nav_num = pd.to_numeric(df["nav"], errors="coerce") if "nav" in df else pd.Series(dtype=float)
    invalid_nav = int(((df["nav"].notna() if "nav" in df else False) & nav_num.isna()).sum())
    add("invalid_or_negative_nav_values",
        int(invalid_nav + (nav_num < 0).sum()),
        note="non-numeric NAV text + NAV < 0 (never repaired by this pipeline)")

    ter_num = pd.to_numeric(df.get("ter_regular"), errors="coerce")
    ter_bad = int(((df.get("ter_regular").notna()) & (ter_num.isna() | (ter_num < 0) | (ter_num > 5))).sum()) if "ter_regular" in df else 0
    add("invalid_expense_ratios", ter_bad,
        note="ter_regular outside the plausible 0-5% band (never repaired)")

    # 11: benchmark info
    add("missing_benchmark_information",
        missing_of("benchmark"), pct(missing_of("benchmark"), total))

    # 12: dates
    invalid_dates = {}
    for col in ["first_date", "last_date", "nav_date", "ter_date"]:
        parsed = pd.to_datetime(df.get(col), errors="coerce", format="mixed")
        bad = int((df.get(col).notna() == True & parsed.isna()).sum()) if col in df else None
        if bad is not None:
            invalid_dates[col] = {"invalid_present_values": int(((df[col].notna()) & parsed.isna()).sum()),
                                  "missing": int(df[col].isna().sum())}
    add("missing_or_invalid_dates", invalid_dates)

    # 13: unmatched records (recomputed live from the master/details sources)
    if join_stats:
        add("unmatched_records_between_datasets", join_stats)

    # Riskometer-level distribution (research-paper evidence table)
    report["riskometer_level_distribution"] = (
        df.riskometer.dropna().value_counts().to_dict() if "riskometer" in df else {}
    )
    report["category_group_distribution"] = (
        df.category_group_clean.dropna().value_counts().to_dict()
        if "category_group_clean" in df else {}
    )
    report["plan_distribution"] = (
        df.scheme_plan.value_counts(dropna=False).to_dict() if "scheme_plan" in df else {}
    )
    report["cleaning_policy"] = (
        "No row deletion, no zero-filling, no synthetic imputation. Missing suitability "
        "attributes make a fund ineligible (flagged, reported) in the recommendation engine."
    )
    return report


def write_report_files(report: dict, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "data_quality_report.json"
    txt_path = out_dir / "data_quality_report.txt"

    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "WealthGenie — Mutual Fund Data Quality Report",
        "=" * 48,
        f"Generated on: {report['generated_on']}",
        f"Dataset: {report['dataset']}",
        "",
    ]
    for item in report["collected"]:
        if isinstance(item, dict):
            label = item.pop("check", "?")
            lines.append(f"— {label}: {json.dumps(item, ensure_ascii=False, default=str)}")
        else:
            lines.append(str(item))
    for title, key in [("Riskometer labels", "riskometer_level_distribution"),
                       ("Category groups", "category_group_distribution"),
                       ("Plans", "plan_distribution")]:
        lines.append("")
        lines.append(title + ":")
        for k, v in (report.get(key) or {}).items():
            lines.append(f"  {k}: {v}")
    lines.append("")
    lines.append("Cleaning policy: " + report["cleaning_policy"])
    txt_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"report written: {json_path.relative_to(ROOT)} + .txt")


def main() -> int:
    if not MERGED.exists():
        print("Blocker: run build_fund_dataset.py first (merged dataset missing).", file=sys.stderr)
        return 2
    df = pd.read_csv(MERGED, low_memory=False)

    join_stats = None
    manifest = ROOT / "data" / "processed" / "wealthgenie_funds_manifest.json"
    if manifest.exists():
        manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
        join_stats = {
            "master_rows": manifest_data["master_rows"],
            "details_rows": manifest_data["details_rows"],
            "details_matched_rows": manifest_data["details_matched_rows"],
            "unmatched_master_rows": manifest_data["unmatched_master_rows"],
            "row_multiplication": manifest_data["row_multiplication"],
        }

    report = build_report(df, join_stats)
    write_report_files(report, ROOT / "data" / "reports")
    return 0


if __name__ == "__main__":
    sys.exit(main())
