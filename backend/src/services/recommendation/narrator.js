/**
 * WealthGenie recommendation engine — explanation generation.
 *
 * The deterministic engine (engine.js) is the sole decision maker. The LLM
 * narrator MAY rewrite the final structured result into plain language only:
 *   - it receives the finished result and may not see otherwise-unknown data,
 *   - its prompt forbids inventing numbers, products, rates or suitability,
 *   - its output is never parsed back into the result — a plain text blob,
 *   - any failure (unconfigured, HTTP error, empty/invalid text) keeps the
 *     deterministic explanation and marks the source accordingly.
 */

import { config } from '../../config/env.js';

export const NARRATOR_RULES = `
You are explaining a finished financial-literacy result. Confirm these rules to yourself before writing:
1. Suitability decisions, scores and rankings were computed deterministically — do not add, remove or re-rank anything.
2. Do not invent interest rates, returns, prices, fund names, NAVs or taxes. Use ONLY the verified data present in the structured result; if the result contains verified fund suggestions, you may summarise them with their own numbers, but add nothing absent from the result.
3. Speak to the user ("you"), in clear simple English, at most 250 words.
4. Cover in order: (a) the readiness summary, (b) any urgent priority, (c) why the suggested category leaders fit and their main risks, (d) any verified fund suggestions with their most important metrics and risk warnings, (e) why some categories or funds are excluded or missing data, (f) a single reminder that nothing here is regulated advice and all rates/returns must be verified on official sources.
`;

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim();
}

export function buildNarratorPrompt(result) {
  return [
    NARRATOR_RULES,
    `Structured result (JSON):\n${JSON.stringify(result)}`,
    'Write the explanation now.',
  ].join('\n\n');
}

/**
 * Optional Gemini narration. Uses the same request shape as ai.service.js but
 * a strict, low-temperature instruction; returns null on any failure so the
 * caller falls back to deterministic text.
 */
export async function narrateResult(result, { aiConfig = config, fetchImpl = globalThis.fetch } = {}) {
  if (!aiConfig?.isAiConfigured || !aiConfig.geminiApiKey) {
    return { ok: false, reason: 'unconfigured' };
  }

  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(String(aiConfig.geminiModel || '').replace(/^models\//, ''))}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': aiConfig.geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildNarratorPrompt(result) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );

    if (!response.ok) {
      return { ok: false, reason: `provider_http_${response.status}` };
    }

    const text = extractText(await response.json());
    if (!text) {
      return { ok: false, reason: 'empty_response' };
    }

    return { ok: true, text };
  } catch (error) {
    return { ok: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'provider_unreachable' };
  }
}

/** Deterministic (LLM-independent) explanation — always available. */
export function deterministicNarrative(result, readiness) {
  const core = readiness.core;
  const lines = [];

  lines.push(
    `Monthly surplus: ${core.monthlySurplus === null ? 'not computable yet' : `₹${core.monthlySurplus.toLocaleString('en-IN')}`} — ` +
    'income minus expenses (loan payments included exactly once).',
  );
  if (core.emergencyFundCoverageMonths !== null) {
    lines.push(`Emergency coverage: about ${core.emergencyFundCoverageMonths.toFixed(1)} months of expenses.`);
  } else {
    lines.push('Emergency coverage: unknown while expenses or savings are missing.');
  }
  lines.push(`Derived risk capacity: level ${readiness.riskCapacity.level} of 5 (from income stability, surplus, cushion and debt burden).`);

  for (const priority of result.priorities) {
    lines.push(`Priority (${priority.urgency}): ${priority.title} — ${priority.detail}`);
  }

  if (result.outcome.status === 'no-suitable-investment-now') {
    lines.push(`No investment suggestion right now: ${result.outcome.headline}`);
  } else {
    for (const rec of result.recommendations.slice(0, 3)) {
      lines.push(
        `Suggested category #${rec.rank}: ${rec.label} (Riskometer band ${rec.riskometerLabel} — ${rec.riskometerLevel}/6). ` +
        `Why: ${rec.reasons[0]}. Watch: ${rec.risks[0]}`,
      );
    }
  }

  for (const excluded of result.excluded.slice(0, 3)) {
    lines.push(`Not suggested: ${excluded.label} — ${excluded.reason}`);
  }

  for (const missing of result.missingMaterial) {
    lines.push(`Missing information (${missing.field}): ${missing.why}`);
  }

  lines.push('Every suggestion above was derived deterministically; verify every rate, cost and risk disclosure on official sources. Educational information only, not regulated financial advice.');

  return lines.join('\n');
}
