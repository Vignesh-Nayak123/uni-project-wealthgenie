"""Stage-1b deep inspection: verify joinability, dupes, NAV messiness")

Read-only. Checks:
- scheme_details real row count (quoted newlines), fund_dedup_flag distribution
- TER/riskometer populate rates
- NAV parquet: nav dtype problems, date range, scheme coverage vs master
- Holdings: fund_code domain, equity/debt/cash mix, join feasibility
"""
from __future__ import annotations

import pandas as pd

BASE = "wealthgenie-datasets/"

master = pd.read_csv(BASE + "scheme_master.csv.csv", low_memory=False)
details = pd.read_csv(BASE + "scheme_details.csv.csv", low_memory=False)

print("master rows:", len(master), "| details rows:", len(details))
print("details scheme_code unique:", details.scheme_code.nunique())
print("details fund_dedup_flag:", details.fund_dedup_flag.value_counts(dropna=False).to_dict())
print("details plan:", details.scheme_plan.value_counts(dropna=False).to_dict())
print("details group_clean:", details.category_group_clean.value_counts(dropna=False).head(12).to_dict())

both = set(master.scheme_code) & set(details.scheme_code)
print("scheme_code overlap:", len(both), "master-only:", len(set(master.scheme_code)-set(details.scheme_code)),
      "details-only:", len(set(details.scheme_code)-set(master.scheme_code)))

for col in ["ssd_riskometer", "ssd_riskometer_level", "ter_regular", "ter_direct",
            "amfi_daily_riskometer", "ssd_sebi_category", "ssd_benchmark_tier1_std"]:
    nonna = details[col].notna().sum()
    print(f"details {col}: non-null {nonna}/{len(details)}", 
          (details[col].value_counts(dropna=False).head(7).to_dict()
           if details[col].dtype == object and nonna else ""))

# NAV parquet: read metadata, then sample groups
import pyarrow.parquet as pq
pf = pq.ParquetFile(BASE + "nav_history.parquet")
print("\nparquet num_row_groups:", pf.num_row_groups, "| schema:", pf.schema_arrow)

codes_master = set(master.scheme_code[:5000])
chunks = []
first_batch = True
for i in range(min(6, pf.num_row_groups)):
    batch = pf.read_row_group(i, columns=["scheme_code", "date", "nav"])
    if first_batch:
        nav_vals = batch.column("nav").to_pylist()[:200000]
        non_numeric = [v for v in nav_vals if not isinstance(v, (int, float))][:10]
        dates = batch.column("date").to_pylist()
        print("nav sample types:", {type(v).__name__ for v in nav_vals[:1000]},
              "| non-numeric examples:", non_numeric[:5],
              "| min date:", min(dates), "| max date:", max(dates))
        # rows where nav is text
        import collections
        bad = collections.Counter()
        for v in nav_vals:
            if not isinstance(v, (int, float)):
                bad[str(v)] += 1
        print("non-numeric nav frequencies (top):", dict(bad.most_common(5)))
        first_batch = False
    chunks.append(batch)
sub = pa_tbl = pd.concat([c.to_pandas() for c in chunks], ignore_index=True)
sub["nav_f"] = pd.to_numeric(sub["nav"], errors="coerce")
print("\nsample batches rows:", len(sub), "scheme_codes:", sub.scheme_code.nunique(),
      "nav NaN:", int(sub.nav_f.isna().sum()))

holdings = pd.read_csv(BASE + "portfolio_holdings.csv.csv", low_memory=False)
print("\nholdings rows:", len(holdings), "funds:", holdings.fund_code.nunique())
print("asset_group:", holdings.asset_group.value_counts(dropna=False).head(8).to_dict())
print("month_end range:", holdings.month_end.min(), holdings.month_end.max(),
      "| month_ends:", holdings.month_end.nunique())

# Join feasibility from holdings fund_code -> master scheme_name / amc
m_codes = set(master.scheme_code)
h_try = holdings.fund_code.dropna().astype(str).str.upper().str.strip()
print("holdings fund_code sample:", h_try.unique()[:15].tolist())

# does master scheme_code appear in holdings isin? no. try name matching small probe
names_master = master.scheme_name.str.upper().str.replace(r"[^A-Z0-9]", "", regex=True)
probe = "AXISFOCUSED"
hit = master[master.scheme_name.str.contains("Axis Focused", case=False, na=False, regex=False)]
print("\n'max focused' in master len:", len(hit) and hit[["scheme_code", "scheme_name", "is_active", "scheme_plan"]].head(5).to_string(index=False))
