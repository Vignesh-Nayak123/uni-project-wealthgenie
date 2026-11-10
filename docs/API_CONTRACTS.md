# WealthGenie API Contracts

Base URL: `http://localhost:5001` (or `process.env.VITE_API_URL`)

---

## 1. Health & Configuration

### `GET /api/health`
Returns system status and configuration state.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "wealthgenie-backend",
  "timestamp": "2026-10-23T17:30:00.000Z",
  "aiConfigured": false
}
```

---

## 2. AI Tutor Endpoint

### `POST /api/ai/chat`
Sends a user query to the AI Financial Tutor.

**Request Body:**
```json
{
  "message": "What is an index fund and how is it different from an active mutual fund?",
  "history": []
}
```

**Response (When Configured - 200 OK):**
```json
{
  "status": "success",
  "reply": "An **Index Fund** is a type of mutual fund that passively tracks a specific benchmark...",
  "disclaimer": "WealthGenie provides educational content for financial literacy and does not constitute certified financial or investment advice."
}
```

**Response (When Unconfigured - 503 Service Unavailable):**
```json
{
  "status": "unconfigured",
  "error": "AI Tutor service is not configured. Please set GEMINI_API_KEY in the backend .env file.",
  "setupRequired": true
}
```

---

## 3. Learning Roadmap Endpoints

### `GET /api/learn/curriculum`
Returns the curated roadmap metadata. This endpoint contains titles, categories and prerequisite IDs only; it never contains generated lesson prose.

**Response (200 OK):**
```json
{
  "version": 1,
  "conceptCount": 23,
  "branches": [
    {
      "id": "money-basics",
      "title": "Money Basics",
      "description": "Understand where money comes from and where it goes.",
      "accent": "emerald"
    }
  ],
  "concepts": [
    {
      "id": "budgeting",
      "title": "Budgeting",
      "category": "Money Basics",
      "branchId": "money-basics",
      "prerequisites": ["income", "expenses"]
    }
  ]
}
```

### `GET /api/learn/lessons`
Lists the curated lessons that are available without an AI provider.

**Response (200 OK):**
```json
{
  "status": "success",
  "source": "curated",
  "schemaVersion": 1,
  "count": 23,
  "lessons": [
    {
      "conceptId": "budgeting",
      "title": "Budgeting",
      "contentVersion": "1.0.0",
      "status": "source-checked",
      "reviewLabel": "Source checked — awaiting human review",
      "isHumanReviewed": false,
      "quizCount": 3,
      "sourceCount": 1
    }
  ]
}
```

### `GET /api/learn/lessons/:conceptId`
Returns one validated curated lesson with resolved citations and its review
record. This endpoint never contacts the AI provider.

**Response (200 OK):**
```json
{
  "status": "success",
  "source": "curated",
  "schemaVersion": 1,
  "contentVersion": "1.0.0",
  "lesson": {
    "conceptId": "budgeting",
    "title": "Budgeting",
    "objectives": [{ "id": "BUD-OBJ-1", "text": "..." }],
    "explanation": ["..."],
    "examples": [{ "id": "BUD-EX-1", "title": "...", "text": "...", "sourceIds": ["RBI-FAME"] }],
    "keyTakeaways": ["..."],
    "quiz": [{ "id": "BUD-Q-1", "objectiveId": "BUD-OBJ-1", "options": ["...", "...", "..."], "correctIndex": 1, "explanation": "..." }],
    "review": { "sourceCheckedAt": "2026-10-28", "reviewedBy": null, "reviewedAt": null, "nextReviewAt": "2027-04-28" }
  },
  "sources": [{ "id": "RBI-FAME", "publisher": "Reserve Bank of India", "url": "https://..." }],
  "review": { "status": "source-checked", "label": "Source checked — awaiting human review", "isHumanReviewed": false }
}
```

**Errors:**
- `400` for a malformed concept slug.
- `404 unknown_concept` for a concept outside the roadmap.
- `404 lesson_not_available` when no valid curated lesson is published; the
  frontend may then use the optional AI path.

### `POST /api/learn/lesson`
Generates one structured lesson through the backend Gemini integration. The API key remains server-side.

**Request Body:**
```json
{
  "conceptId": "budgeting"
}
```

**Response (Configured - 200 OK):**
```json
{
  "status": "success",
  "lesson": {
    "conceptId": "budgeting",
    "title": "Budgeting",
    "category": "Money Basics",
    "explanation": "AI-generated beginner-friendly explanation.",
    "example": "AI-generated Indian example using INR.",
    "whyItMatters": "AI-generated explanation of why the concept matters.",
    "quiz": {
      "question": "AI-generated multiple-choice question.",
      "options": ["Option A", "Option B", "Option C"],
      "correctIndex": 0,
      "explanation": "AI-generated feedback explaining the correct answer."
    }
  },
  "provider": "gemini",
  "model": "gemini-1.5-flash",
  "generatedAt": "2026-10-25T08:00:00.000Z",
  "disclaimer": "WealthGenie provides educational content for financial literacy and does not constitute certified financial or investment advice."
}
```

**Response (Unconfigured - 503 Service Unavailable):**
```json
{
  "status": "unconfigured",
  "message": "AI lesson generation is not configured. Please set GEMINI_API_KEY in the backend .env file.",
  "setupRequired": true
}
```

**Errors:**
- `400` when `conceptId` is missing, empty or too long.
- `404` for a concept outside the curated roadmap.
- `502` when the AI provider fails, blocks the request, or returns malformed/invalid lesson JSON.
- No AI lesson content is returned on errors. Curated lessons are served from the versioned content files instead, so a missing AI key never blocks a published lesson.

**Lesson validation rules:**
- Exactly three unique quiz options.
- `correctIndex` must be `0`, `1` or `2`.
- The Indian example must contain an INR marker.
- Explanation, example, why-it-matters, quiz question and feedback are all required.
- The provider is instructed to act as an educational tutor, not a personalized investment adviser.

### Learning progress endpoints

All routes below require `Authorization: Bearer <supabase-access-token>` and
scope every read and write to the verified user. A missing or expired token
returns `401 unauthorized`; an unconfigured Supabase backend returns
`503 auth_not_configured`.

- `GET /api/learn/progress` — returns `{ progress: { completedConceptIds, quizProgress, updatedAt } }`.
- `PUT /api/learn/progress` — replaces the snapshot with a validated body of the same shape.
- `POST /api/learn/progress/merge` — unions completed concepts and keeps the best quiz attempt. Used on sign-in and after local changes.
- `DELETE /api/learn/progress` — deletes the signed-in user's row.

`quizProgress` maps a concept ID to `{ correct, total, completed, updatedAt }`.
Unknown concept IDs and impossible scores are rejected with `400`. The database
side is defined in `supabase/migrations/20261028120000_learning_progress.sql`
with RLS policies requiring `auth.uid() = user_id`.

---

## 4. Financial Calculation Endpoints

### `POST /api/calculate/sip`
Calculates deterministic Systematic Investment Plan (SIP) maturity values.

**Request Body:**
```json
{
  "monthlyInvestment": 5000,
  "annualRate": 12,
  "years": 10
}
```

**Response (200 OK):**
```json
{
  "disclaimer": "Illustrative mathematical projection based on user-entered mathematical assumptions. Not an indicator or guarantee of future returns.",
  "result": {
    "monthlyInvestment": 5000,
    "annualRatePct": 12,
    "years": 10,
    "totalMonths": 120,
    "totalInvested": 600000,
    "estimatedReturns": 561695,
    "totalValue": 1161695,
    "isZeroRate": false
  }
}
```

---

## 5. Investment Sources Endpoint

### `GET /api/investments/sources`
Returns official planned data sources and their status.

**Response (200 OK):**
```json
{
  "count": 4,
  "sources": [
    {
      "id": "nifty-50-tri",
      "name": "Nifty 50 Total Returns Index (TRI)",
      "provider": "NSE Indices Limited (Nifty Indices)",
      "status": "Connected and verified"
    },
    {
      "id": "amfi-nav-history",
      "name": "AMFI Mutual Fund NAV & Scheme Master",
      "provider": "Association of Mutual Funds in India (AMFI)",
      "status": "Connected and verified"
    }
  ]
}
```

---

## 6. Historical Benchmark Data

### `GET /api/investments/historical`
Returns verified Nifty 50 TRI observations. Optional `startDate`, `endDate`, and `downsample` query parameters are supported.

**Response (200 OK):**
```json
{
  "status": "connected",
  "source": "Nifty 50 Total Returns Index (TRI)",
  "provider": "NSE Indices Limited",
  "coverage": { "startDate": "2010-01-04", "endDate": "2026-10-23", "tradingDays": 4170 },
  "rawSha256": "05974e09...",
  "count": 4170,
  "data": [{ "date": "2010-01-04", "tri": 10000 }]
}
```

If the dataset is unavailable, the endpoint returns an honest `status: "unconnected"` payload rather than fabricated values.

---

## 7. Historical Benchmark SIP Simulation

### `POST /api/investments/simulate/benchmark`
Runs a deterministic monthly SIP back-test against genuine Nifty 50 TRI observations.

**Request Body:**
```json
{
  "monthlyInvestment": 5000,
  "startDate": "2015-01-01",
  "endDate": "2019-12-31",
  "sipDay": 1
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "instrument": "Nifty 50 Total Returns Index (TRI)",
  "instrumentType": "benchmark",
  "provider": "NSE Indices Limited",
  "startDate": "2015-01-01",
  "endDate": "2019-12-31",
  "requestedStartDate": "2015-01-01",
  "requestedEndDate": "2019-12-31",
  "installmentsCount": 60,
  "totalInvested": 300000,
  "portfolioValue": 400606,
  "totalGain": 100606,
  "absoluteReturnPct": 33.54,
  "annualizedReturnXIRR": 11.52,
  "annualizedReturnValid": true,
  "indexBuyAndHoldCAGR": 9.38,
  "unitsAccumulated": 23.4587,
  "observationsInRange": 1234,
  "skippedContributionMonths": [],
  "monthlySnapshots": [],
  "portfolioSeries": [
    {
      "date": "2019-12-31",
      "totalInvested": 300000,
      "portfolioValue": 400606,
      "tri": 17077.06,
      "isFinalValuation": true
    }
  ],
  "dataSource": {
    "provider": "NSE Indices Limited",
    "coverage": { "startDate": "2010-01-04", "endDate": "2026-10-23" },
    "rawSha256": "05974e09..."
  }
}
```

`portfolioValue`, return values and observation counts are computed from the verified dataset and are not placeholders in the actual response. `portfolioSeries` includes the final valuation date even when it is not a monthly contribution date.

---

## 8. Verified Mutual Fund Schemes

### `GET /api/investments/mutual-funds`
Returns the verified AMFI scheme list and provenance metadata.

**Response (200 OK):**
```json
{
  "status": "connected",
  "provider": "Association of Mutual Funds in India (AMFI)",
  "sourceUrl": "https://www.amfiindia.com/net-asset-value/nav-download",
  "retrievalDate": "2026-10-24T20:10:32.709Z",
  "rawSha256": "b54ad08b...",
  "schemesCount": 2,
  "schemes": [
    {
      "schemeCode": "120716",
      "schemeName": "UTI Nifty 50 Index Fund - Growth Option- Direct",
      "fundHouse": "UTI Mutual Fund",
      "isin": "INF789F01XA0",
      "plan": "Direct",
      "option": "Growth",
      "observationCount": 694,
      "startDate": "2024-01-01",
      "endDate": "2026-10-23",
      "rawSha256": "8ce181e8...",
      "rawChunkCount": 12,
      "rawArtifactPath": "data/raw/amfi/history/nav_history_20261024T201032709Z"
    }
  ]
}
```

---

## 9. Historical Mutual Fund SIP Simulation

### `POST /api/investments/simulate/mutual-fund`
Runs a deterministic monthly SIP back-test using genuine AMFI NAV observations for one verified scheme.

**Request Body:**
```json
{
  "schemeCode": "120716",
  "monthlyInvestment": 5000,
  "startDate": "2024-01-01",
  "endDate": "2026-10-23",
  "sipDay": 1
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "instrument": "Mutual Fund Historical NAV Simulation",
  "instrumentType": "mutual-fund",
  "schemeCode": "120716",
  "schemeName": "UTI Nifty 50 Index Fund - Growth Option- Direct",
  "provider": "Association of Mutual Funds in India (AMFI)",
  "installmentsCount": 34,
  "totalInvested": 170000,
  "portfolioValue": 162628,
  "totalGain": -7372,
  "absoluteReturnPct": -4.34,
  "annualizedReturnXIRR": -3.07,
  "unitsAccumulated": 1021.6787,
  "startNav": 148.9515,
  "endNav": 159.177,
  "monthlySnapshots": [],
  "portfolioSeries": [],
  "schemeIdentity": {
    "schemeCode": "120716",
    "isin": "INF789F01XA0",
    "plan": "Direct",
    "option": "Growth"
  },
  "dataSource": {
    "provider": "Association of Mutual Funds in India (AMFI)",
    "rawSha256": "8ce181e8...",
    "rawArtifactPath": "data/raw/amfi/history/nav_history_20261024T201032709Z",
    "coverage": { "startDate": "2024-01-01", "endDate": "2026-10-23", "observationCount": 694 }
  }
}
```

**Errors:**
- `400` for invalid investment amount, invalid dates, start date after end date, or a range with fewer than 20 observations.
- `404` for an unknown scheme code.
- `503` if the verified dataset is not connected.

---

## Historical SIP Rules

- Monthly contributions execute at the first available observation on or after the 1st of each month (`sipDay` defaults to 1).
- Months without an eligible observation are skipped and reported in `skippedContributionMonths`.
- Missing market dates are never interpolated.
- Ending value uses the last available observation on or before the requested end date; the actual valuation date is returned in `endDate`.
- `monthlySnapshots` contains contribution dates only. `portfolioSeries` additionally includes the final valuation date and is intended for charting.
- Annualized return uses XIRR over actual dated cash flows and is `null` when the numerical solve does not converge.
