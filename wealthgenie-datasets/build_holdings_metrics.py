"""
WealthGenie — portfolio-holdings metrics pipeline.

Reads wealthgenie-datasets/portfolio_holdings.csv.csv and, per fund snapshot
(fund_code × month_end, ONLY from rows present in the source — nothing inferred):
  data/processed/fund_holdings_metrics.csv

Derived per fund (latest reported month_end when multiple are present):
  - allocation: equity / debt / cash+money-market / other (% of fund)
  - top holdings (top 5 by pct_of_fund, from actual rows)
  - top-5 concentration and HHI (sum of squared pct_of_fund of present rows)

Join limitation (documented, surfaced in the manifest):
  holdings are keyed by an AMC-style `fund_code` (e.g. AXISFOCUSED) that does
  not exist in the scheme master/details identifier domain. Matching is done
  on normalized fund names against the merged dataset, reported as best-effort
  with the unmatched list kept explicit.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATASETS = ROOT / "wealthgenie-datasets"
MERGED = ROOT / "data" / "processed" / "wealthgenie_funds.csv"
OUT = ROOT / "data" / "processed" / "fund_holdings_metrics.csv"
MANIFEST = ROOT / "data" / "processed" / "fund_holdings_metrics_manifest.json"


def resolve_input(stem: str) -> Path:
    """The raw files arrive either as `x.csv` or `x.csv.csv`."""
    for candidate in (DATASETS / f"{stem}.csv", DATASETS / stem):
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Source dataset `{stem}` not found in {DATASETS}.")

ALLOCATION_GROUPS = ["Equity", "Debt", "Money market", "Cash", "Other"]


def normalize_name(value: str) -> str:
    text = re.sub(r"[^A-Z0-9 ]", " ", str(value).upper())
    return re.sub(r"\s+", " ", text).strip()


def main() -> int:
    holdings = pd.read_csv(resolve_input("portfolio_holdings.csv"), low_memory=False)
    holdings["month_end"] = pd.to_datetime(holdings["month_end"], errors="coerce")
    holdings = holdings.dropna(subset=["month_end"])
    holdings["pct_val"] = pd.to_numeric(holdings["pct_of_fund"], errors="coerce")

    snapshots = []
    for (fund_code, month_end), group in holdings.groupby(["fund_code", "month_end"]):
        equity_pct = float(group.loc[group.asset_group == "Equity", "pct_val"].sum())
        debt_pct = float(group.loc[group.asset_group == "Debt", "pct_val"].sum())
        cash_pct = float(
            group.loc[group.asset_group.isin(["Money market", "Cash"]), "pct_val"].sum()
        )
        other_pct = float(group.loc[~group.asset_group.isin(ALLOCATION_GROUPS), "pct_val"].sum())
        top = group.nlargest(5, "pct_val")[["security_name", "pct_val"]]
        hhi = float((group.loc[group.pct_val > 0, "pct_val"] ** 2).sum())

        snapshots.append({
            "fund_code": fund_code,
            "snapshot_month_end": str(month_end.date()),
            "holding_rows": int(len(group)),
            "allocation_equity_pct_reported": round(equity_pct, 2),
            "allocation_cash_money_market_pct_reported": round(cash_pct, 2),
            "allocation_other_pct_reported": round(other_pct, 2),
            "allocation_debt_pct_reported": round(debt_pct, 2),
            "allocation_pct_pct_sum": round(equity_pct + debt_pct + cash_pct + other_pct, 2),
            "top5_concentration_pct_reported": round(float(top.pct_val.sum()), 2),
            "concentration_hhi": round(hhi, 2),
            "top_holdings": [
                {"security_name": str(name), "pct_of_fund": round(float(pct), 2)}
                for name, pct in top.itertuples(index=False)
            ],
        })

    frame = pd.DataFrame(snapshots)
    frame.to_csv(OUT, index=False)

    # ── Best-effort name join into the merged fund dataset ───────────────────
    matched = None
    if MERGED.exists():
        merged = pd.read_csv(MERGED, low_memory=False, usecols=["scheme_code", "fund_name"])
        merged["norm"] = merged.fund_name.map(normalize_name)
        match_rows = []
        for fund_code, fund_name in (
            holdings[["fund_code", "fund_name"]].drop_duplicates().itertuples(index=False)
        ):
            target = normalize_name(fund_name)
            hits = merged.loc[merged.norm.str.startswith(target[:30]) &
                              merged.norm.str.contains(re.escape(target.split()[0]) if target.split() else "")
                              , "scheme_code"] if target else []
            codes = sorted(set(int(c) for c in hits))[:20]
            match_rows.append({
                "fund_code": fund_code,
                "holdings_fund_name": fund_name,
                "matched_scheme_codes": codes,
                "matched_count": len(codes),
            })
        match_frame = pd.DataFrame(match_rows)
        matched = {
            "holdings_funds": int(match_frame.shape[0]),
            "matched_funds": int((match_frame.matched_count > 0).sum()),
            "unmatched_funds": sorted(match_frame.loc[match_frame.matched_count == 0, "fund_code"].tolist()),
            "note": (
                "Best-effort normalized-name match between the AMC-style holdings "
                "fund_code / fund_name and scheme names. Not an identifier join; "
                "treated as enrichment only."
            ),
        }

    manifest = {
        "source": str(resolve_input("portfolio_holdings.csv").relative_to(ROOT)),
        "holding_rows": int(len(holdings)),
        "holdings_funds": int(holdings.fund_code.nunique()),
        "month_ends": sorted(set(holdings.month_end.dt.strftime("%Y-%m-%d"))),
        "asset_group_distribution": holdings.asset_group.value_counts().to_dict(),
        "output": {
            "rows": int(len(frame)),
            "command": "python wealthgenie-datasets/build_holdings_metrics.py",
        },
        "scheme_code_match": matched,
        "limitations": [
            "Only 24 funds report holdings in this dataset — coverage is narrow and "
            "concentration metrics must not be generalized across the universe.",
            "Allocation percentages are used as reported in the source rows; they "
            "are NOT renormalized.",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({
        "holding_rows": manifest["holding_rows"],
        "holdings_funds": manifest["holdings_funds"],
        "snapshots": int(len(frame)),
        "match": matched and {
            "matched_funds": matched["matched_funds"],
            "unmatched_funds": matched["unmatched_funds"],
        },
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
