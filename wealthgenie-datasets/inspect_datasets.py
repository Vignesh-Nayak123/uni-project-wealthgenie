"""One-off schema discovery for the raw wealthgenie-datasets/ files.

Reports actual columns, dtypes, identifier uniqueness, date formats and sample
records. Never mutates source files (read-only).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).parent

FILES = {
    "scheme_master.csv": DATA_DIR / "scheme_master.csv.csv",
    "scheme_details.csv": DATA_DIR / "scheme_details.csv.csv",
    "portfolio_holdings.csv": DATA_DIR / "portfolio_holdings.csv.csv",
    "nav_history.parquet": DATA_DIR / "nav_history.parquet",
}


def describe_csv(path: Path, label: str) -> pd.DataFrame:
    df = pd.read_csv(path, nrows=8)
    full_cols = pd.read_csv(path, nrows=0).columns.tolist()
    print(f"\n=== {label}: {path.name} ===")
    print("columns:", full_cols)
    print(df.head(3).to_string(index=False))
    return df


def main() -> int:
    master = describe_csv(FILES["scheme_master.csv"], "Scheme Master")
    details = describe_csv(FILES["scheme_details.csv"], "Scheme Details")
    holdings = describe_csv(FILES["portfolio_holdings.csv"], "Portfolio Holdings")

    # Row counts + identifier uniqueness on the full CSVs (lengths only; cheap)
    for label, path in [
        ("scheme_master", FILES["scheme_master.csv"]),
        ("scheme_details", FILES["scheme_details.csv"]),
        ("portfolio_holdings", FILES["portfolio_holdings.csv"]),
    ]:
        n = sum(1 for _ in open(path, encoding="utf-8", errors="replace")) - 1
        print(f"\n{label}: total data rows = {n}")

    print("\n=== nav_history.parquet (metadata + head) ===")
    pf = pd.read_parquet(FILES["nav_history.parquet"], engine="pyarrow")
    print("rows:", len(pf))
    print("columns:", pf.columns.tolist())
    print("dtypes:\n", pf.dtypes.to_string())
    print(pf.head(4).to_string(index=False))
    print("\nparquet row-groups:", pf.attrs, "| shape:", pf.shape)

    # Join-key uniqueness overview
    for label, df in [("master", None), ("details", None)]:
        pass
    m_full = pd.read_csv(FILES["scheme_master.csv"])
    d_full = pd.read_csv(FILES["scheme_details.csv"])
    for label, df in [("master", m_full), ("details", d_full)]:
        id_cols = [c for c in df.columns if "code" in c.lower() or "isin" in c.lower()
                   or "amfi" in c.lower() or "scheme" in c.lower()][:4]
        print(f"\n{label} candidate id columns: {id_cols}")
        for col in id_cols[:2]:
            n_rows = len(df)
            n_unique = df[col].nunique(dropna=True)
            n_dup = int(n_rows - df[col].dropna().duplicated().sum()) if n_unique else 0
            print(f"  {col}: rows={n_rows} unique={n_unique} duplicated_rows="
                  f"{int(df[col].dropna().duplicated().sum())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
