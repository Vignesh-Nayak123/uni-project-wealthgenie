export const LESSON_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    explanation: {
      type: 'STRING',
      description: 'A concise beginner-friendly explanation of the concept in 2-4 short sentences.',
    },
    example: {
      type: 'STRING',
      description: 'One relatable Indian example that uses INR and Indian number grouping.',
    },
    whyItMatters: {
      type: 'STRING',
      description: 'One or two sentences explaining why this concept matters for everyday money decisions.',
    },
    quiz: {
      type: 'OBJECT',
      properties: {
        question: {
          type: 'STRING',
          description: 'A single multiple-choice question that tests understanding of the explanation.',
        },
        options: {
          type: 'ARRAY',
          minItems: 3,
          maxItems: 3,
          items: { type: 'STRING' },
          description: 'Exactly three plausible answer options.',
        },
        correctIndex: {
          type: 'INTEGER',
          description: 'The zero-based index of the correct option: 0, 1 or 2.',
        },
        explanation: {
          type: 'STRING',
          description: 'Feedback that explains why the correct answer is right and why the other options are not.',
        },
      },
      required: ['question', 'options', 'correctIndex', 'explanation'],
    },
  },
  required: ['explanation', 'example', 'whyItMatters', 'quiz'],
};

export function buildLessonPrompt(concept, prerequisiteTitles = []) {
  const prerequisiteText =
    prerequisiteTitles.length > 0
      ? prerequisiteTitles.join(', ')
      : 'None. This is a starting concept.';

  return `Create one financial-literacy lesson for a beginner in India.

Concept: ${concept.title}
Category: ${concept.category}
Prerequisites the learner has already completed: ${prerequisiteText}

The JSON response format below overrides any general bullet-point or markdown formatting instructions. Return only a JSON object with this exact structure:
{
  "explanation": "string",
  "example": "string",
  "whyItMatters": "string",
  "quiz": {
    "question": "string",
    "options": ["string", "string", "string"],
    "correctIndex": 0,
    "explanation": "string"
  }
}

Lesson rules:
- Use plain Indian English and keep the explanation beginner-friendly and concise.
- The example must be one relatable Indian scenario using INR (₹) and Indian number grouping.
- The quiz must have exactly three options and exactly one correct answer.
- The quiz feedback must explain the correct answer without shaming the learner.
- Focus only on the named concept and do not introduce unrelated products.
- You are an educational tutor, not a personalized investment adviser.
- Do not recommend buying, selling or holding any specific stock, fund or scheme.
- Do not promise or guarantee investment returns.
- For UPI safety, state clearly that a UPI PIN is used only to send or pay money, never to receive money.
- For market-linked concepts, distinguish risk from guaranteed returns.
- Do not include markdown, code fences, citations, or text outside the JSON object.`;
}
