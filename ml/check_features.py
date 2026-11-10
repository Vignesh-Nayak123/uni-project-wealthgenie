
from pathlib import Path
import pandas as pd

root = Path(__file__).resolve().parent.parent
csv_path = root / "data" / "Findex_Microdata_2025_updateIndia.csv"

df = pd.read_csv(csv_path, low_memory=False)

features = [
    "age",
    "educ",
    "inc_q",
    "emp_in",
    "urbanicity",
    "saved",
    "borrowed",
    "fin24",
]

for col in features:
    print(f"\n{'=' * 45}")
    print(f"{col}:")
    print("Unique values:", sorted(df[col].dropna().unique().tolist()))
    print("Counts:")
    print(df[col].value_counts(dropna=False).sort_index().to_string())
