import pandas as pd

master = pd.read_csv("scheme_master.csv")
details = pd.read_csv("scheme_details.csv")

merged = master.merge(
    details,
    on="scheme_code",
    how="left",
    suffixes=("_master", "_details")
)

merged.to_csv("wealthgenie_funds.csv", index=False)

print("Merge completed!")
print("Total records:", len(merged))
print(merged.head())