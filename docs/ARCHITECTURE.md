# WealthGenie System Architecture

WealthGenie is an AI-powered financial-literacy platform designed specifically for Indian beginners. The project uses a single clean monorepo architecture avoiding unnecessary microservices.

```
wealthgenie/
├── frontend/          # React 18, Vite, Tailwind CSS, client routing
├── backend/           # Node.js, Express, deterministic calculations, API layer
├── ai/                # AI prompts, safety rules, future RAG retrieval logic
├── data/              # Immutable raw datasets, processed data, and provenance
├── docs/              # System architecture, API contracts, Indian financial context
├── tests/             # Unit tests for calculations, currency formatters & API tests
├── .env.example       # Example environment variables
├── package.json       # Monorepo orchestration scripts
└── README.md
```

## Component Boundaries

1. **Frontend (`frontend/`)**:
   - Pure client UI using React and Tailwind CSS.
   - Talks to backend API for AI queries (`POST /api/ai/chat`) and verified dataset status (`GET /api/investments/sources`).
   - Formatters enforce `en-IN` numbering and INR (`₹`) across all screens.
   - Zero hardcoded API keys or client-side LLM calls.

2. **Backend Service (`backend/`)**:
   - Lightweight Express REST API.
   - Houses deterministic formulas (`financialMath.js`) for Systematic Investment Plans (SIP) and compound growth.
   - Validates all request parameters with standard error formats.
   - Handles LLM provider integration with graceful failure when unconfigured.

3. **AI & Safety Layer (`ai/`)**:
   - Declares the pedagogical persona, system prompt, and safety boundaries.
   - Guards against illegal stock recommendations, speculative trading, or unverified return promises.
   - Prepares future integration with RAG pipelines grounded in SEBI/RBI/AMFI literature.

4. **Data Management (`data/`)**:
   - Explicit distinction between raw downloads and processed artifacts.
   - Mandatory provenance metadata in `sources/sources.json`.
   - Never fabricates or injects mock market indices.
