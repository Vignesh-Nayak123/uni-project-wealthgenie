
from pathlib import Path
import pandas as pd

# Locate the project data folder
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"

csv_path = DATA_DIR / "Findex_Microdata_2025_updateIndia.csv"

if not csv_path.exists():
    raise FileNotFoundError(f"Dataset not found: {csv_path}")

df = pd.read_csv(csv_path, low_memory=False)

print("=" * 60)
print("WEALTHGENIE - DATASET INSPECTION")
print("=" * 60)

print(f"\nDataset file: {csv_path.name}")
print(f"Number of rows: {df.shape[0]}")
print(f"Number of columns: {df.shape[1]}")

print("\n--- COLUMN NAMES ---")
for column in df.columns:
    print(column)

print("\n--- MISSING VALUES (TOP 20) ---")
print(df.isna().sum().sort_values(ascending=False).head(20))

print("\n--- TARGET CANDIDATE: fin24a ---")
if "fin24a" in df.columns:
    print("Value counts:")
    print(df["fin24a"].value_counts(dropna=False).to_string())
else:
    print("Column fin24a not found. Check the column names.")

print("\n--- FIRST 5 ROWS ---")
print(df.head().to_string())

print("\nInspection complete.")
