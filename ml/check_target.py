
from pathlib import Path
import pandas as pd

root = Path(__file__).resolve().parent.parent
csv_path = root / "data" / "Findex_Microdata_2025_updateIndia.csv"

df = pd.read_csv(csv_path, low_memory=False)

print("TARGET: fin24a")
print("\nRaw response counts:")
print(df["fin24a"].value_counts(dropna=False).sort_index())

print("\nMissing target values:", df["fin24a"].isna().sum())

print("\nTarget vs emergency money source (fin24):")
print(pd.crosstab(
    df["fin24"],
    df["fin24a"],
    margins=True,
    dropna=False
))

print("\nTarget vs household income quintile (inc_q):")
print(pd.crosstab(
    df["inc_q"],
    df["fin24a"],
    margins=True,
    dropna=False
))
