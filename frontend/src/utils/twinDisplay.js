import { formatINR } from './formatters';

export const TWIN_KIND_LABELS = Object.freeze({
  currency: 'INR',
  percent: '%',
  months: 'months',
});

export function formatTwinMetric(kind, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'Not available';
  }

  const numeric = Number(value);

  if (kind === 'currency') return formatINR(numeric);
  if (kind === 'percent') return `${numeric.toFixed(1)}%`;
  if (kind === 'months') return `${numeric.toFixed(1)} months`;
  return String(numeric);
}

export function formatTwinDifference(item) {
  if (!item || item.difference === null || item.difference === undefined) {
    return 'Not comparable';
  }

  const value = item.difference;
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';

  if (item.kind === 'currency') {
    return `${sign}${formatINR(Math.abs(value))}`;
  }
  if (item.kind === 'percent') {
    return `${sign}${Math.abs(value).toFixed(1)} pp`;
  }
  if (item.kind === 'months') {
    return `${sign}${Math.abs(value).toFixed(1)} months`;
  }
  return `${sign}${Math.abs(value)}`;
}

export function formatTwinPercentageChange(item) {
  if (
    !item ||
    item.percentageChange === null ||
    item.percentageChange === undefined
  ) {
    return null;
  }

  const value = item.percentageChange;
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function formatTwinDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatTwinDateTime(value) {
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

export function twinSeverityStyles(severity) {
  const styles = {
    critical: {
      card: 'border-rose-200 bg-rose-50/70 text-rose-950',
      badge: 'rose',
      icon: 'text-rose-700',
    },
    warning: {
      card: 'border-amber-200 bg-amber-50/70 text-amber-950',
      badge: 'amber',
      icon: 'text-amber-700',
    },
    positive: {
      card: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
      badge: 'emerald',
      icon: 'text-emerald-700',
    },
    info: {
      card: 'border-slate-200 bg-slate-50 text-slate-800',
      badge: 'slate',
      icon: 'text-slate-500',
    },
  };

  return styles[severity] || styles.info;
}

export function twinToneForSurplus(value) {
  if (!Number.isFinite(Number(value))) return 'slate';
  return Number(value) >= 0 ? 'green' : 'rose';
}

const TWIN_INPUT_FIELDS = Object.freeze([
  { key: 'monthlyIncome', label: 'Monthly income' },
  { key: 'monthlyExpenses', label: 'Monthly expenses' },
  { key: 'accessibleSavings', label: 'Accessible savings' },
  { key: 'emiPayments', label: 'EMI payments' },
  { key: 'unexpectedExpense', label: 'Unexpected expense' },
]);

function parseTwinNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Compare a scenario against its baseline input field by field. Only fields
 * where the scenario has an explicit value that differs from the baseline are
 * returned, because an empty scenario value means "same as baseline".
 *
 * @returns {Array<{label: string, from: number|null, to: number}>}
 */
export function buildChangedAssumptions(baselineInputs = {}, scenarioInputs = {}) {
  const changed = [];

  for (const field of TWIN_INPUT_FIELDS) {
    const baselineValue = parseTwinNumber(baselineInputs[field.key]);
    const scenarioValue = parseTwinNumber(scenarioInputs[field.key]);

    if (scenarioValue === null) continue;
    if (scenarioValue === baselineValue) continue;

    changed.push({
      label: field.label,
      from: baselineValue,
      to: scenarioValue,
    });
  }

  return changed;
}

export function formatTwinInputs(inputs) {
  if (!inputs || typeof inputs !== 'object') return 'Not available';

  return Object.entries(inputs)
    .map(([key, value]) => {
      if (value === null || value === undefined) {
        return `${key}: not available`;
      }
      if (typeof value === 'boolean') {
        return `${key}: ${value ? 'yes' : 'no'}`;
      }
      if (typeof value === 'number') {
        return `${key}: ${Number.isInteger(value) ? value : value.toFixed(2)}`;
      }
      return `${key}: ${value}`;
    })
    .join(' · ');
}
