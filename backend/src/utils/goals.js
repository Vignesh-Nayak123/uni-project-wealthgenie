export const GOAL_CATEGORIES = Object.freeze([
  'Security',
  'Milestone',
  'Retirement',
  'Lifestyle',
  'Other',
]);

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

function isMissing(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

function validateText(value, label, { required = false, maxLength }) {
  if (isMissing(value)) {
    if (required) throw new Error(`${label} is required.`);
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${label} must be text.`);
  }

  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    throw new Error(`${label} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function validateAmount(value, label, { allowMissing = false, allowZero = true } = {}) {
  if (isMissing(value)) {
    if (allowMissing) return null;
    throw new Error(`${label} is required.`);
  }

  if (typeof value === 'boolean') {
    throw new Error(`${label} must be a valid number.`);
  }

  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a valid number.`);
  }
  if (allowZero ? numeric < 0 : numeric <= 0) {
    throw new Error(
      allowZero ? `${label} must be zero or greater.` : `${label} must be greater than zero.`
    );
  }

  return numeric;
}

function validateCategory(value) {
  if (isMissing(value)) return 'Other';
  if (typeof value !== 'string') {
    throw new Error('Goal category must be text.');
  }

  const trimmed = value.trim();
  const match = GOAL_CATEGORIES.find(
    (category) => category.toLowerCase() === trimmed.toLowerCase()
  );

  if (!match) {
    throw new Error(`Goal category must be one of: ${GOAL_CATEGORIES.join(', ')}.`);
  }

  return match;
}

function validateDate(value) {
  if (isMissing(value)) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new Error('Target date must use YYYY-MM-DD format.');
  }

  const trimmed = value.trim();
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new Error('Target date is not a valid calendar date.');
  }

  return trimmed;
}

export function validateGoalCreate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Goal input must be an object.');
  }

  return {
    title: validateText(input.title, 'Goal title', {
      required: true,
      maxLength: MAX_TITLE_LENGTH,
    }),
    category: validateCategory(input.category),
    targetAmount: validateAmount(input.targetAmount, 'Target amount', {
      allowZero: false,
    }),
    currentAmount: validateAmount(input.currentAmount, 'Current amount', {
      allowMissing: true,
      allowZero: true,
    }) ?? 0,
    targetDate: validateDate(input.targetDate),
    description: validateText(input.description, 'Goal description', {
      maxLength: MAX_DESCRIPTION_LENGTH,
    }),
  };
}

export function validateGoalUpdate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Goal input must be an object.');
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    updates.title = validateText(input.title, 'Goal title', {
      required: true,
      maxLength: MAX_TITLE_LENGTH,
    });
  }
  if (Object.prototype.hasOwnProperty.call(input, 'category')) {
    updates.category = validateCategory(input.category);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'targetAmount')) {
    updates.targetAmount = validateAmount(input.targetAmount, 'Target amount', {
      allowZero: false,
    });
  }
  if (Object.prototype.hasOwnProperty.call(input, 'currentAmount')) {
    updates.currentAmount = validateAmount(input.currentAmount, 'Current amount', {
      allowZero: true,
    });
  }
  if (Object.prototype.hasOwnProperty.call(input, 'targetDate')) {
    updates.targetDate = validateDate(input.targetDate);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    updates.description = validateText(input.description, 'Goal description', {
      maxLength: MAX_DESCRIPTION_LENGTH,
    });
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('Provide at least one goal field to update.');
  }

  return updates;
}

export function goalInsertRow(input, userId) {
  return {
    user_id: userId,
    title: input.title,
    category: input.category,
    target_amount: input.targetAmount,
    current_amount: input.currentAmount,
    target_date: input.targetDate,
    description: input.description,
  };
}

export function goalUpdateRow(updates) {
  const row = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.category !== undefined) row.category = updates.category;
  if (updates.targetAmount !== undefined) row.target_amount = updates.targetAmount;
  if (updates.currentAmount !== undefined) row.current_amount = updates.currentAmount;
  if (updates.targetDate !== undefined) row.target_date = updates.targetDate;
  if (updates.description !== undefined) row.description = updates.description;
  return row;
}

export function mapGoalRow(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    targetAmount: Number(row.target_amount),
    currentAmount: Number(row.current_amount),
    targetDate: row.target_date,
    description: row.description || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
