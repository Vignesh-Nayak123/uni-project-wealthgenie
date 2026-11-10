export const ASSESSMENT_GOAL_OPTIONS = [
  { value: 'emergency_fund', label: 'Emergency fund' },
  { value: 'debt_repayment', label: 'Debt repayment' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'home_purchase', label: 'Home purchase' },
  { value: 'education', label: 'Education' },
  { value: 'wealth_building', label: 'Wealth building' },
  { value: 'other', label: 'Other goal' },
];

export const ASSESSMENT_GOAL_LABELS = Object.fromEntries(
  ASSESSMENT_GOAL_OPTIONS.map((option) => [option.value, option.label])
);

export function assessmentGoalLabel(goal) {
  return ASSESSMENT_GOAL_LABELS[goal] || 'Financial goal';
}

export function formatAssessmentDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatAssessmentDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
