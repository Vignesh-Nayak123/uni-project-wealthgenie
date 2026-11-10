# WealthGenie Data Pipeline & Provenance Standards

This directory organizes genuine financial datasets used for financial education and historical simulations.

## Integrity Principle: Never Fabricate Data

WealthGenie adheres to strict data integrity:
- **No Mock Market Data in Production**: We do not invent historical returns, daily index levels, arbitrary stock tickers, or mock percentage yields.
- **Strictly No Date Interpolation**: Market holidays and weekends are authentic non-trading days. Ingestion pipelines never fabricate or linearly interpolate missing observations.
- **Unconnected State**: Whenever a dataset has not been verified or connected, the platform explicitly displays an honest unconnected state.

## Directory Structure

```
data/
├── raw/         # Original, immutable datasets obtained from primary sources
│   ├── nifty_50_tri_raw_<timestamp>.json
│   ├── amfi_nav_raw_<timestamp>.json
│   └── amfi/history/<run_id>/   # Exact AMFI response bodies + manifest
├── processed/   # Reproducibly transformed datasets (cleaned, normalized, timestamped)
│   ├── nifty_tri.json    # Full provenance metadata + daily TRI series
│   ├── nifty_tri.csv     # Standard 2-column CSV (Date, Total Returns Index)
│   ├── amfi_nav.json     # AMFI scheme observations
│   └── amfi_nav.csv      # AMFI NAV observations
├── sources/     # Source metadata, license constraints, and verification logs
│   └── sources.json
└── README.md    # Acquisition instructions and pipeline standards
```

## Integrated Official Sources (Phase 1)

### 1. Nifty Indices (NSE Indices Limited) — Total Returns Index (TRI)
- **Dataset**: Nifty 50 Total Returns Index (TRI) historical daily closing values.
- **Status**: **Connected and verified**.
- **Official Source**: [NSE Indices Historical Reports](https://www.niftyindices.com/reports/historical-data).
- **Official Endpoint**: `POST https://www.niftyindices.com/BackPage/getTotalReturnIndexString`.
- **Primary Constraints**:
  - Enforces a maximum date window of **365 days** per request.
  - Ingestion pipeline automatically splits multi-year spans into yearly chunks with polite rate-limiting pauses.
- **Automated Ingestion Command**:
  ```bash
  npm run import:nifty
  # Or with custom range:
  node scripts/importNifty.js --start 2010-01-01 --end 2026-10-23
  ```
- **Manual Fallback**:
  If network bot protection interferes:
  1. Visit `https://www.niftyindices.com/reports/historical-data`.
  2. Select "Total returns Index Values" -> "Equity" -> "NIFTY 50".
  3. Export CSV and save as `data/raw/nifty_tri_manual.csv`.
  4. Run `node scripts/importNifty.js --local`.

### 2. AMFI (Association of Mutual Funds in India) — Scheme Historical NAV
- **Dataset**: Historical Net Asset Value (NAV) per unit for open-ended schemes. Verified schemes: UTI Nifty 50 Index Fund Direct Growth (`120716`, ISIN `INF789F01XA0`) and HDFC Nifty 50 Index Fund Direct Growth (`119063`, ISIN `INF179K01WM1`).
- **Status**: **Connected and verified** for both schemes, `2024-01-01` to `2026-10-23`.
- **Official Source**: [AMFI NAV Download Portal](https://www.amfiindia.com/net-asset-value/nav-download).
- **Official Endpoint**: `GET https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?mf=<amcCode>&tp=1&frmdt=<dd-Mon-yyyy>&todt=<dd-Mon-yyyy>`.
- **Primary Constraints**:
  - Enforces a maximum query window of **~90 days (1 quarter)** per request. Queries exceeding ~120 days redirect to the HTML homepage.
  - Semicolon-delimited report includes all schemes for an AMC; ingestion strictly isolates the target scheme code without mixing funds.
- **Raw Provenance**:
  - Exact HTTP response bodies are stored per chunk under `data/raw/amfi/history/<run_id>/<scheme_code>/`.
  - `manifest.json` records request URLs, response metadata, per-chunk SHA-256 checksums, and a per-scheme aggregate SHA-256 over the exact raw response bytes.
  - Raw run directories are immutable; a new retrieval always creates a new unique directory.
- **Automated Ingestion Command**:
  ```bash
  npm run import:amfi
  # Or with custom range:
  node scripts/importAMFI.js 2024-01-01 2026-10-23
  ```
- **Manual Fallback**:
  Place downloaded AMFI report at `data/raw/amfi_nav_manual.txt` and run `node scripts/importAMFI.js --local`.

## Ingestion Standards

Every dataset in WealthGenie must:
1. Preserve raw immutable downloads under `data/raw/`; never overwrite an existing raw artifact.
2. Preserve exact source response bodies and compute SHA-256 checksums over those bytes, plus per-scheme coverage and checksums in `data/sources/sources.json`.
3. Normalize all observation dates to ISO-8601 (`YYYY-MM-DD`).
4. Validate that index and NAV levels are positive numeric floats.
5. Deduplicate overlapping dates and maintain chronological ascending sort order.
6. Strictly avoid inventing or interpolating missing days.
7. Write processed JSON, CSV, and source registry updates atomically.

## Data-Quality Gate

`node scripts/validateDataQuality.js` runs read-only validation over the processed
datasets and the source registry (exit code 1 on any ERROR):

1. **Missing values** — every observation row must carry a date + numeric value.
2. **Duplicate records** — duplicate observation dates per index/scheme.
3. **Invalid dates** — ISO-8601 format and real calendar dates.
4. **Stale data** — days since the last observation / NAV snapshot (warnings).
5. **Scheme identifiers** — AMFI scheme codes and 12-character ISIN formats (`IN` + 9 alphanumerics + check digit).
6. **Source provenance** — `data/sources/sources.json` field completeness, raw
   artifacts present on disk, and SHA-256 recomputation against the recorded
   checksums (per-scheme raw payload, manifest file, individual chunks, NAVAll.txt).

## Regulatory & Banking Reference Sources

### 3. SEBI — Riskometer & Product Labelling
- **Official page**: <https://investor.sebi.gov.in/riskometer.html>
- Six mandatory risk levels for every MF scheme and benchmark: Low, Low to
  Moderate, Moderate, Moderately High, High, Very High (with the official colour
  scheme). AMCs must evaluate the Riskometer monthly and disclose it with their
  portfolio disclosures and on AMFI's website.
- Legal basis: SEBI circular `CIR/IMD/DF/4/2015`, the six-level update
  `SEBI/HO/IMD/DF3/CIR/P/2020/197`, and clause 17.4 of the Master Circular for
  Mutual Funds. Sebi registry entry: `sebi-riskometer` in `data/sources/sources.json`.
- WealthGenie **links out and cites the circular**; it does not mirror SEBI
  publications or scrape AMC Riskometer files.

### 4. AMC Factsheets & Scheme Documents
- **Official AMFI index**: <https://www.amfiindia.com/online-center/download-factsheets>
- Verified direct pages: UTI MF <https://www.utimf.com/downloads/fact-sheet>,
  HDFC MF <https://www.hdfcfund.com/mutual-funds/factsheets>.
- Monthly, SEBI-mandated (within 10 days of month-end), public PDFs. Collection
  is **manual and selective** (per scheme actually used); no bulk scraping.
  Factsheets are AMC copyright — educational display with attribution only.

### 5. RBI Banking / Deposit Statistics & FD Rates
- **Database on Indian Economy (DBIE)**: <https://data.rbi.org.in> → Homepage >
  **Publications**. Download the latest *Basic Statistical Return (BSR)-2 on
  Deposits with Scheduled Commercial Banks* (quarterly incl. RRBs / annual) for
  deposit type, ownership, maturity, size and interest-rate-range distributions.
- **Data-release index**: <https://www.rbi.org.in/Scripts/Statistics.aspx/BS_StatisticsDisplay.aspx>
  (fortnightly aggregate deposits via Form-A; monthly *Lending and Deposit Rates
  of Scheduled Commercial Banks*; monthly *Composition and Ownership Pattern of
  Deposits*).
- **Current FD rates from official bank pages** (verified paths, all freely
  viewable): SBI <https://sbi.co.in/web/interest-rates/interest-rates-on-deposit>,
  HDFC Bank <https://www.hdfcbank.com/personal/save/fixed-deposit/fd-interest-rates>,
  ICICI Bank <https://www.icicibank.com/personal-banking/deposits/fixed-deposit/fd-rates>.
  Bank URLs occasionally move — if a link 404s, navigate from the bank homepage.
- **Integrity rule** (see `india-fd-rates` in `sources.json`): rates are copied
  only from openly displayed official pages, always stamped with the access
  date; if no official rate is verified, the UI shows an honest unconnected
  state instead of an approximation. No scraping of restricted data.

## Public Market Data vs. Private User Profiles

Public financial data lives **exclusively under `data/`** (this directory) and is
served to all users; it contains **no personal information** — only benchmark
indices, NAV rows, and scheme metadata. The gates below are enforced by
`scripts/validateDataQuality.js`:

1. `data/**` must never contain credentials, access tokens or user identifiers
   (escalated as an ERROR if a registry entry does).
2. Private user financial profiles, progress records and paper-trading state
   live in **Supabase** (row-level-security, per-user) and server-side only;
   they are never copied into the public data layer.
3. Any new dataset added to `data/raw/` must come from a public source listed in
   `data/sources/sources.json`, recorded with its retrieval date and checksum.

