
import { config, DEFAULT_GEMINI_MODEL } from '../config/env.js';
import { SYSTEM_TUTOR_PROMPT } from '../../../ai/prompts/tutorPrompt.js';
import {
  LESSON_RESPONSE_SCHEMA,
  buildLessonPrompt,
} from '../../../ai/prompts/lessonPrompt.js';
import {
  LessonValidationError,
  parseLessonJson,
  validateLessonPayload,
} from '../utils/lessonSchema.js';

const AI_DISCLAIMER =
  'WealthGenie provides educational content for financial literacy and does not constitute certified financial or investment advice.';

function buildGeminiEndpoint(apiKey, model) {
  const normalizedModel = String(model || '').replace(/^models\//, '');

  return (
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(normalizedModel)}:generateContent`
  );
}

// Thinking models spend part of maxOutputTokens on hidden reasoning before the
// visible answer. The old 1400-token lesson budget was regularly exhausted by
// ~1100-1300 thought tokens, truncating the JSON mid-string (finishReason
// MAX_TOKENS) and surfacing as "AI provider did not return a JSON object".
export const LESSON_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_AI_TIMEOUT_MS = 45_000;

function extractResponseText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return '';
  }

  // Skip thought-summary parts: they are model reasoning, not the answer, and
  // would corrupt the lesson JSON if concatenated into it.
  return parts
    .filter((part) => !part?.thought)
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function getFinishReason(data) {
  return data?.candidates?.[0]?.finishReason || null;
}

function getApiKey(aiConfig) {
  return String(aiConfig?.geminiApiKey || '').trim();
}

function getModel(aiConfig) {
  return String(aiConfig?.geminiModel || DEFAULT_GEMINI_MODEL).trim();
}

function getTimeoutMs(aiConfig) {
  const value = Number(aiConfig?.aiTimeoutMs);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_AI_TIMEOUT_MS;
}

/**
 * Optional `thinkingConfig.thinkingLevel` (e.g. "low") for models that support
 * it. Only sent when GEMINI_THINKING_LEVEL is set, because models without
 * thinking support reject the field.
 */
function withThinkingConfig(generationConfig, aiConfig) {
  const level = String(aiConfig?.geminiThinkingLevel || '').trim();
  if (!level) return generationConfig;
  return { ...generationConfig, thinkingConfig: { thinkingLevel: level } };
}

function isTimeoutError(err) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError';
}

function isConfigured(aiConfig) {
  return Boolean(
    aiConfig?.isAiConfigured &&
    getApiKey(aiConfig) &&
    getModel(aiConfig)
  );
}

async function requestGemini({
  aiConfig,
  prompt,
  generationConfig,
  fetchImpl = globalThis.fetch,
}) {
  const apiKey = getApiKey(aiConfig);
  const model = getModel(aiConfig);
  const endpoint = buildGeminiEndpoint(apiKey, model);

  // Without a timeout a hung provider connection holds the request (and the
  // learner's spinner) open indefinitely.
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: withThinkingConfig(generationConfig, aiConfig),
    }),
    signal: AbortSignal.timeout(getTimeoutMs(aiConfig)),
  });

  // IMPORTANT: Never parse a failed HTTP response as lesson JSON.
  if (!response.ok) {
    const errorBody = await response.text();

    console.error('Gemini request failed:', {
      status: response.status,
      model,
      error: errorBody,
    });

    return {
      ok: false,
      status: response.status,
    };
  }

  const data = await response.json();

  return {
    ok: true,
    data,
    model,
  };
}

export async function generateLesson(concept, options = {}) {
  const aiConfig = options.aiConfig || config;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!isConfigured(aiConfig)) {
    return {
      status: 'unconfigured',
      message:
        'AI lesson generation is not configured. Please set GEMINI_API_KEY in the backend .env file.',
      setupRequired: true,
    };
  }

  try {
    const prompt = [
      SYSTEM_TUTOR_PROMPT,
      buildLessonPrompt(
        concept,
        options.prerequisiteTitles || []
      ),
    ].join('\n\n');

    const result = await requestGemini({
      aiConfig,
      prompt,
      fetchImpl,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: LESSON_MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseSchema: LESSON_RESPONSE_SCHEMA,
      },
    });

    // Return immediately for 4xx/5xx errors, including HTTP 503.
    if (!result.ok) {
      // Quota and rate-limit failures are common and should read as a
      // temporary limit, not a broken feature. Curated lessons do not use the
      // provider, so they keep working when this happens.
      if (result.status === 429) {
        return {
          status: 'error',
          code: 'provider_quota',
          message:
            'The AI provider quota or rate limit has been reached. Source-checked lessons still open without AI. Please try again later.',
        };
      }

      return {
        status: 'error',
        code: 'provider_error',
        message:
          `AI provider error (${result.status}). Please try again.`,
      };
    }

    const blockedReason = result.data?.promptFeedback?.blockReason;

    if (blockedReason) {
      return {
        status: 'error',
        code: 'provider_blocked',
        message:
          'The AI provider blocked this lesson request. Please try another concept.',
      };
    }

    const responseText = extractResponseText(result.data);
    const finishReason = getFinishReason(result.data);

    // A truncated lesson is never valid JSON; report the real cause instead of
    // a misleading parse error.
    if (finishReason === 'MAX_TOKENS') {
      console.error('Lesson generation truncated by maxOutputTokens:', {
        model: result.model,
        usage: result.data?.usageMetadata,
      });

      return {
        status: 'error',
        code: 'provider_truncated',
        message:
          'The AI provider stopped before finishing the lesson. Please try again.',
      };
    }

    if (!responseText) {
      return {
        status: 'error',
        code: 'empty_response',
        message:
          'The AI provider returned no lesson content. Please try again.',
      };
    }

    // JSON parsing happens only after a successful provider response.
    let payload;

    try {
      payload = parseLessonJson(responseText);
    } catch (err) {
      if (err instanceof LessonValidationError) {
        console.error(
          'Lesson JSON parsing failed:',
          err.code,
          err.message
        );

        return {
          status: 'error',
          code: err.code,
          message:
            'The AI provider returned an invalid lesson. Please try again.',
          details: err.message,
        };
      }

      throw err;
    }

    let lesson;

    try {
      lesson = validateLessonPayload(payload, concept);
    } catch (err) {
      if (err instanceof LessonValidationError) {
        console.error(
          'Lesson validation failed:',
          err.code,
          err.message
        );

        return {
          status: 'error',
          code: err.code,
          message:
            'The AI provider returned an invalid lesson. Please try again.',
          details: err.message,
        };
      }

      throw err;
    }

    return {
      status: 'success',
      lesson,
      provider: 'gemini',
      model: result.model,
      disclaimer: AI_DISCLAIMER,
    };
  } catch (err) {
    if (isTimeoutError(err)) {
      console.error('Lesson generation timed out.');
      return {
        status: 'error',
        code: 'provider_timeout',
        message:
          'The AI provider took too long to generate this lesson. Please try again.',
      };
    }

    console.error('Unexpected lesson generation error:', err.message);

    return {
      status: 'error',
      code: 'provider_unreachable',
      message:
        'Could not generate the lesson. Please check the backend logs and try again.',
      details: err.message,
    };
  }
}
