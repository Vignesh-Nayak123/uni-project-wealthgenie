
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / "data" / "Findex_Microdata_2025_updateIndia.csv"
OUTPUT = ROOT / "data" / "processed" / "findex_resilience.csv"

df = pd.read_csv(INPUT, low_memory=False)

# Initial features only; fin24 is deliberately excluded.
features = [
    "age",
    "educ",
    "inc_q",
    "emp_in",
    "urbanicity",
    "saved",
    "borrowed",
]

target = "fin24a"

# Keep only valid, substantive target responses.
clean = df.loc[df[target].isin([1, 2, 3]), features + [target]].copy()

# Drop rows missing required inputs for this first baseline dataset.
clean = clean.dropna(subset=features + [target])

# Store target as integer class labels.
clean[target] = clean[target].astype(int)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
clean.to_csv(OUTPUT, index=False)

print("Original rows:", len(df))
print("Rows retained:", len(clean))
print("Rows excluded:", len(df) - len(clean))
print("\nTarget distribution:")
print(clean[target].value_counts().sort_index())
print("\nSaved to:", OUTPUT)
