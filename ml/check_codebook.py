
from pathlib import Path
import pandas as pd

root = Path(__file__).resolve().parent.parent
csv_path = root / "data" / "Findex_Microdata_2025_updateIndia.csv"

df = pd.read_csv(csv_path, low_memory=False)

print("TARGET COUNTS")
print(df["fin24a"].value_counts(dropna=False).sort_index())

print("\nCROSS-TAB: TARGET VS CANDIDATE FEATURES")

for col in ["age", "educ", "inc_q", "emp_in",
            "urbanicity", "saved", "borrowed"]:
    print(f"\n--- {col} vs fin24a ---")
    print(pd.crosstab(
        df[col],
        df["fin24a"],
        dropna=False
    ).to_string())

print("\nDone. Verify category meanings against the official codebook.")
