# WealthGenie AI Architecture & Safety Rules

This directory contains the system prompts, safety guardrails, and future retrieval-augmented generation (RAG) specifications for WealthGenie's AI Financial Literacy Tutor.

## Principles

1. **No Fake AI**: In Phase 0, client-side keyword matching and simulated bot responses have been completely removed.
2. **Backend-Mediated LLM**: The only model call is optional lesson generation through the backend (`POST /api/learn/lesson`), used when a concept has no curated lesson. The free-form chat tutor has been removed. Frontend browser bundles never receive or handle API keys.
3. **Honest State**: If `GEMINI_API_KEY` is not present in the backend environment, the system gracefully and honestly declares that the AI tutor is unconfigured, providing clear setup instructions rather than pretending to generate answers.
4. **Compliance & Guardrails**:
   - WealthGenie is an educational platform, not a SEBI-registered Investment Adviser (RIA).
   - Prohibits specific stock recommendations, speculation, and guaranteed returns.
   - Grounded in Indian financial instruments (SIPs, Nifty 50, FD/RD, PPF/EPF, UPI safety).
5. **Future Grounding (RAG)**: In future phases, tutor responses will be grounded in verified documents from SEBI, RBI, AMFI, and Nifty Indices stored under `/data/processed/`.
