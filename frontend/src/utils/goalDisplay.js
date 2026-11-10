export const GOAL_CATEGORY_OPTIONS = [
  'Security',
  'Milestone',
  'Retirement',
  'Lifestyle',
  'Other',
];

const CATEGORY_STYLES = {
  Security: { iconName: 'ShieldCheck', color: 'emerald', badgeVariant: 'emerald' },
  Milestone: { iconName: 'Home', color: 'blue', badgeVariant: 'blue' },
  Retirement: { iconName: 'TrendingUp', color: 'indigo', badgeVariant: 'indigo' },
  Lifestyle: { iconName: 'Compass', color: 'amber', badgeVariant: 'amber' },
  Other: { iconName: 'Target', color: 'genie', badgeVariant: 'slate' },
};

export function goalCategoryStyle(category) {
  return CATEGORY_STYLES[category] || CATEGORY_STYLES.Other;
}

export function formatGoalDate(value) {
  if (!value) return 'No target date';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'No target date';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function goalProgressPercent(goal) {
  const target = Number(goal?.targetAmount) || 0;
  const current = Number(goal?.currentAmount) || 0;
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}
