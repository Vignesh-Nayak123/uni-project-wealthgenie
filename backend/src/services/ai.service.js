
import { config } from '../config/env.js';
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

function extractResponseText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function getApiKey(aiConfig) {
  return String(aiConfig?.geminiApiKey || '').trim();
}

function getModel(aiConfig) {
  return String(aiConfig?.geminiModel || 'gemini-3.8-flash').trim();
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
      generationConfig,
    }),
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

export async function getTutorResponse(
  userMessage,
  conversationHistory = []
) {
  if (!isConfigured(config)) {
    return {
      status: 'unconfigured',
      message:
        'AI Tutor service is not configured. Please set GEMINI_API_KEY in the backend .env file to enable live financial tutoring.',
      setupRequired: true,
    };
  }

  try {
    const historyText = Array.isArray(conversationHistory)
      ? conversationHistory
        .map((item) => {
          const role = item?.role || 'user';
          const content =
            item?.content || item?.message || item?.text || '';

          return content
            ? `${role}: ${String(content)}`
            : '';
        })
        .filter(Boolean)
        .join('\n')
      : '';

    const prompt = [
      SYSTEM_TUTOR_PROMPT,
      historyText ? `Conversation history:\n${historyText}` : '',
      `User Question: ${String(userMessage ?? '')}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await requestGemini({
      aiConfig: config,
      prompt,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      },
    });

    if (!result.ok) {
      return {
        status: 'error',
        message: `Upstream AI provider error: ${result.status}`,
      };
    }

    const replyText =
      extractResponseText(result.data) ||
      'No educational response received from provider.';

    return {
      status: 'success',
      reply: replyText,
      disclaimer: AI_DISCLAIMER,
    };
  } catch (err) {
    console.error('AI Tutor request failed:', err.message);

    return {
      status: 'error',
      message: 'Failed to contact AI provider service',
      error: err.message,
    };
  }
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
        maxOutputTokens: 1400,
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
