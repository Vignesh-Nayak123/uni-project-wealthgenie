/**
 * Seeded synthetic financial profiles for the Phase 4 evaluation.
 *
 * IMPORTANT: every profile is synthetic. It is not a real person, a survey
 * respondent, or real-world evidence. The generator is separate from the
 * Global Findex dataset in `data/` and never reads or writes that data.
 *
 * The generator mixes:
 *   1. seeded random profiles drawn from documented archetypes, and
 *   2. a fixed set of deterministic edge cases (boundaries and zero
 *      denominators) that are always included unless disabled.
 */

import {
  normalizeTwinThresholds,
  resolveAsOfDate,
} from '../../backend/src/utils/financialTwin.js';
import {
  chance,
  mulberry32,
  pick,
  randBetween,
  randInt,
  roundTo,
} from './rng.js';

export const DATASET_VERSION = '1.0.0';

export const DEFAULT_CONFIG = Object.freeze({
  experimentVersion: '1.0.0',
  seed: 20261027,
  profiles: 200,
  includeEdgeCases: true,
  asOfDate: '2026-10-27',
  thresholds: Object.freeze({
    lowMandatoryCoverageMonths: 3,
    highEmiBurdenPct: 40,
  }),
});

export const RANDOM_ARCHETYPES = Object.freeze([
  'positive_surplus',
  'zero_surplus',
  'negative_surplus',
  'emi_separate',
  'emi_included',
  'low_emergency_savings',
  'high_emergency_savings',
  'shock_funded',
  'shock_unfunded',
  'goal_achieved',
  'goal_achievable',
  'goal_unreachable',
  'zero_income',
  'zero_expenses',
]);

export const SCENARIO_NAMES = Object.freeze([
  'income_up',
  'expenses_up',
  'emi_up',
  'savings_up',
  'shock',
  'combined_stress',
  'goal_contribution_up',
]);

export const PROFILE_COLUMNS = Object.freeze([
  'id',
  'source',
  'archetype',
  'note',
  'asOfDate',
  'monthlyIncome',
  'monthlyExpenses',
  'accessibleSavings',
  'goal',
  'emiPayments',
  'emiIncludedInExpenses',
  'unexpectedExpense',
  'monthlySavingsCapacity',
  'targetAmount',
  'currentGoalSavings',
  'goalTimelineMonths',
]);

function baseProfile(overrides = {}) {
  return {
    monthlyIncome: 0,
    monthlyExpenses: 0,
    accessibleSavings: 0,
    goal: 'other',
    emiPayments: 0,
    emiIncludedInExpenses: true,
    unexpectedExpense: 0,
    monthlySavingsCapacity: null,
    targetAmount: null,
    currentGoalSavings: 0,
    goalTimelineMonths: null,
    ...overrides,
  };
}

function income(rng) {
  return roundTo(randBetween(rng, 15000, 300000), 500);
}

function maybeTarget(rng, monthlyIncome, minMonths, maxMonths) {
  if (!chance(rng, 0.5)) return null;
  return Math.max(
    1000,
    roundTo(monthlyIncome * randBetween(rng, minMonths, maxMonths), 1000)
  );
}

function makeRandomProfile(rng, index, archetype, config) {
  const I = income(rng);

  let profile;

  switch (archetype) {
    case 'positive_surplus': {
      const E = roundTo(I * randBetween(rng, 0.3, 0.65), 100);
      const M = roundTo(I * randBetween(rng, 0, 0.15), 100);
      const S = roundTo(E * randBetween(rng, 3, 12), 100);
      const target = maybeTarget(rng, I, 6, 24);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: pick(rng, [
          'emergency_fund',
          'retirement',
          'wealth_building',
        ]),
        emiPayments: M,
        emiIncludedInExpenses: true,
        monthlySavingsCapacity: chance(rng, 0.5)
          ? roundTo(Math.max(100, (I - E) * randBetween(rng, 0.2, 0.9)), 100)
          : null,
        targetAmount: target,
        currentGoalSavings:
          target === null
            ? 0
            : roundTo(target * randBetween(rng, 0, 0.4), 100),
        goalTimelineMonths:
          target !== null && chance(rng, 0.5) ? randInt(rng, 6, 36) : null,
      });
      break;
    }

    case 'zero_surplus': {
      const E = I;
      const S = roundTo(I * randBetween(rng, 1, 6), 100);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: 'other',
      });
      break;
    }

    case 'negative_surplus': {
      const E = roundTo(I * randBetween(rng, 1.05, 1.35), 100);
      const S = roundTo(I * randBetween(rng, 0, 1.5), 100);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: 'debt_repayment',
        emiPayments: roundTo(I * randBetween(rng, 0, 0.15), 100),
        emiIncludedInExpenses: true,
      });
      break;
    }

    case 'emi_separate': {
      const E = roundTo(I * randBetween(rng, 0.25, 0.5), 100);
      const M = roundTo(I * randBetween(rng, 0.1, 0.35), 100);
      const S = roundTo((E + M) * randBetween(rng, 1, 6), 100);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: 'debt_repayment',
        emiPayments: M,
        emiIncludedInExpenses: false,
        monthlySavingsCapacity: chance(rng, 0.5)
          ? roundTo(I * randBetween(rng, 0.02, 0.1), 100)
          : null,
      });
      break;
    }

    case 'emi_included': {
      const E = roundTo(I * randBetween(rng, 0.35, 0.7), 100);
      const M = roundTo(I * randBetween(rng, 0.05, 0.2), 100);
      const S = roundTo(E * randBetween(rng, 2, 8), 100);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: 'other',
        emiPayments: M,
        emiIncludedInExpenses: true,
      });
      break;
    }

    case 'low_emergency_savings': {
      const E = roundTo(I * randBetween(rng, 0.3, 0.6), 100);
      const S = roundTo(E * randBetween(rng, 0.1, 1.5), 100);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: 'emergency_fund',
      });
      break;
    }

    case 'high_emergency_savings': {
      const E = roundTo(I * randBetween(rng, 0.3, 0.6), 100);
      const S = roundTo(E * randBetween(rng, 6, 18), 100);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: 'retirement',
      });
      break;
    }

    case 'shock_funded': {
      const E = roundTo(I * randBetween(rng, 0.3, 0.6), 100);
      const S = roundTo(E * randBetween(rng, 4, 12), 100);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: 'emergency_fund',
        unexpectedExpense: roundTo(S * randBetween(rng, 0.2, 0.8), 100),
      });
      break;
    }

    case 'shock_unfunded': {
      const E = roundTo(I * randBetween(rng, 0.3, 0.6), 100);
      const S = roundTo(E * randBetween(rng, 0.5, 3), 100);
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: S,
        goal: 'emergency_fund',
        unexpectedExpense: roundTo(S * randBetween(rng, 1.2, 2.5) + 10000, 100),
      });
      break;
    }

    case 'goal_achieved': {
      const E = roundTo(I * randBetween(rng, 0.3, 0.6), 100);
      const target = Math.max(1000, roundTo(I * randBetween(rng, 6, 24), 1000));
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: roundTo(E * randBetween(rng, 2, 8), 100),
        goal: 'home_purchase',
        targetAmount: target,
        currentGoalSavings: roundTo(
          target * randBetween(rng, 1.0, 1.4),
          100
        ),
        monthlySavingsCapacity: roundTo(I * randBetween(rng, 0.05, 0.2), 100),
        goalTimelineMonths: randInt(rng, 6, 36),
      });
      break;
    }

    case 'goal_achievable': {
      const E = roundTo(I * randBetween(rng, 0.3, 0.6), 100);
      const target = Math.max(1000, roundTo(I * randBetween(rng, 6, 30), 1000));
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: roundTo(E * randBetween(rng, 1, 6), 100),
        goal: 'education',
        targetAmount: target,
        currentGoalSavings: roundTo(
          target * randBetween(rng, 0.1, 0.5),
          100
        ),
        monthlySavingsCapacity: roundTo(I * randBetween(rng, 0.05, 0.2), 100),
        goalTimelineMonths: randInt(rng, 12, 48),
      });
      break;
    }

    case 'goal_unreachable': {
      const E = roundTo(I * randBetween(rng, 0.95, 1.25), 100);
      const target = Math.max(1000, roundTo(I * randBetween(rng, 6, 24), 1000));
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: E,
        accessibleSavings: roundTo(I * randBetween(rng, 0, 2), 100),
        goal: 'other',
        targetAmount: target,
        currentGoalSavings: roundTo(target * randBetween(rng, 0, 0.2), 100),
        monthlySavingsCapacity: 0,
      });
      break;
    }

    case 'zero_income': {
      const E = roundTo(randBetween(rng, 5000, 40000), 100);
      profile = baseProfile({
        monthlyIncome: 0,
        monthlyExpenses: E,
        accessibleSavings: roundTo(randBetween(rng, 0, 100000), 100),
        goal: 'other',
      });
      break;
    }

    case 'zero_expenses': {
      profile = baseProfile({
        monthlyIncome: I,
        monthlyExpenses: 0,
        accessibleSavings: roundTo(randBetween(rng, 0, 200000), 100),
        goal: 'wealth_building',
      });
      break;
    }

    default:
      throw new Error(`Unknown random archetype: ${archetype}`);
  }

  return {
    id: `syn-${String(index + 1).padStart(4, '0')}`,
    source: 'synthetic',
    archetype,
    note: `Seeded synthetic profile (${archetype}).`,
    asOfDate: config.asOfDate,
    ...profile,
  };
}

/**
 * Deterministic edge cases. These guarantee coverage of boundaries and
 * zero-denominator cases at any sample size.
 */
export const EDGE_CASES = Object.freeze([
  {
    id: 'edge-zero-income',
    archetype: 'zero_income',
    note: 'Income is zero, so savings rate and EMI burden are undefined.',
    input: baseProfile({
      monthlyIncome: 0,
      monthlyExpenses: 20000,
      accessibleSavings: 50000,
    }),
  },
  {
    id: 'edge-zero-expenses',
    archetype: 'zero_expenses',
    note: 'Living expenses are zero, so living-expense coverage is undefined.',
    input: baseProfile({
      monthlyIncome: 60000,
      monthlyExpenses: 0,
      accessibleSavings: 0,
      goal: 'wealth_building',
    }),
  },
  {
    id: 'edge-zero-outflows-emi-included',
    archetype: 'zero_outflows',
    note: 'Expenses are zero and EMI is included, so mandatory outflows are zero.',
    input: baseProfile({
      monthlyIncome: 60000,
      monthlyExpenses: 0,
      accessibleSavings: 30000,
      emiPayments: 5000,
      emiIncludedInExpenses: true,
    }),
  },
  {
    id: 'edge-zero-everything',
    archetype: 'zero_everything',
    note: 'All monetary inputs are zero; every denominator is zero.',
    input: baseProfile({}),
  },
  {
    id: 'edge-break-even',
    archetype: 'break_even',
    note: 'Income exactly equals outflows.',
    input: baseProfile({
      monthlyIncome: 50000,
      monthlyExpenses: 50000,
      accessibleSavings: 100000,
    }),
  },
  {
    id: 'edge-deficit',
    archetype: 'deficit',
    note: 'Outflows exceed income.',
    input: baseProfile({
      monthlyIncome: 30000,
      monthlyExpenses: 45000,
      accessibleSavings: 20000,
      goal: 'debt_repayment',
    }),
  },
  {
    id: 'edge-coverage-exactly-3',
    archetype: 'coverage_boundary',
    note: 'Savings cover exactly 3 months of outflows; the strict < threshold must not trigger.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 40000,
      accessibleSavings: 120000,
    }),
  },
  {
    id: 'edge-coverage-below-3',
    archetype: 'coverage_boundary',
    note: 'Savings cover just under 3 months of outflows.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 40000,
      accessibleSavings: 119999,
    }),
  },
  {
    id: 'edge-emi-exactly-40',
    archetype: 'emi_boundary',
    note: 'EMI is exactly 40% of income; the strict > threshold must not trigger.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 10000,
      accessibleSavings: 100000,
      emiPayments: 40000,
      emiIncludedInExpenses: false,
    }),
  },
  {
    id: 'edge-emi-above-40',
    archetype: 'emi_boundary',
    note: 'EMI is just above 40% of income.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 10000,
      accessibleSavings: 100000,
      emiPayments: 40001,
      emiIncludedInExpenses: false,
    }),
  },
  {
    id: 'edge-shock-exactly-funded',
    archetype: 'shock_funded',
    note: 'Unexpected expense exactly equals accessible savings.',
    input: baseProfile({
      monthlyIncome: 80000,
      monthlyExpenses: 40000,
      accessibleSavings: 50000,
      unexpectedExpense: 50000,
    }),
  },
  {
    id: 'edge-shock-unfunded',
    archetype: 'shock_unfunded',
    note: 'Unexpected expense exceeds accessible savings.',
    input: baseProfile({
      monthlyIncome: 80000,
      monthlyExpenses: 40000,
      accessibleSavings: 50000,
      unexpectedExpense: 60000,
    }),
  },
  {
    id: 'edge-goal-achieved-exact',
    archetype: 'goal_achieved',
    note: 'Current goal savings exactly equal the target.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 40000,
      accessibleSavings: 200000,
      goal: 'home_purchase',
      targetAmount: 300000,
      currentGoalSavings: 300000,
      monthlySavingsCapacity: 10000,
      goalTimelineMonths: 12,
    }),
  },
  {
    id: 'edge-goal-achieved-above',
    archetype: 'goal_achieved',
    note: 'Current goal savings exceed the target.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 40000,
      accessibleSavings: 200000,
      goal: 'home_purchase',
      targetAmount: 300000,
      currentGoalSavings: 350000,
      monthlySavingsCapacity: 10000,
      goalTimelineMonths: 12,
    }),
  },
  {
    id: 'edge-goal-unreachable',
    archetype: 'goal_unreachable',
    note: 'A zero contribution leaves a positive remaining amount unreachable.',
    input: baseProfile({
      monthlyIncome: 40000,
      monthlyExpenses: 40000,
      accessibleSavings: 10000,
      targetAmount: 100000,
      monthlySavingsCapacity: 0,
    }),
  },
  {
    id: 'edge-goal-float-noise',
    archetype: 'float_noise',
    note: '0.07 / 0.01 is 7.000000000000001 in binary floating point and must round to 7 months.',
    input: baseProfile({
      monthlyIncome: 1,
      monthlyExpenses: 0,
      accessibleSavings: 0,
      targetAmount: 0.07,
      monthlySavingsCapacity: 0.01,
    }),
  },
  {
    id: 'edge-month-end-feb',
    archetype: 'month_end',
    note: '31 January 2024 plus 1 month clamps to 29 February 2024.',
    asOfDate: '2024-01-31',
    input: baseProfile({
      monthlyIncome: 50000,
      monthlyExpenses: 10000,
      accessibleSavings: 50000,
      targetAmount: 10000,
      monthlySavingsCapacity: 10000,
    }),
  },
  {
    id: 'edge-month-end-sep',
    archetype: 'month_end',
    note: '31 August 2026 plus 1 month clamps to 30 September 2026.',
    asOfDate: '2026-08-31',
    input: baseProfile({
      monthlyIncome: 50000,
      monthlyExpenses: 10000,
      accessibleSavings: 50000,
      targetAmount: 10000,
      monthlySavingsCapacity: 10000,
    }),
  },
  {
    id: 'edge-no-goal',
    archetype: 'no_goal',
    note: 'No target amount is provided.',
    input: baseProfile({
      monthlyIncome: 75000,
      monthlyExpenses: 30000,
      accessibleSavings: 150000,
      goal: 'retirement',
    }),
  },
  {
    id: 'edge-timeline-exact',
    archetype: 'timeline',
    note: 'The requested timeline is exactly met.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 40000,
      accessibleSavings: 100000,
      targetAmount: 120000,
      monthlySavingsCapacity: 10000,
      goalTimelineMonths: 12,
    }),
  },
  {
    id: 'edge-timeline-gap',
    archetype: 'timeline',
    note: 'The requested timeline is not met.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 40000,
      accessibleSavings: 100000,
      targetAmount: 120000,
      monthlySavingsCapacity: 5000,
      goalTimelineMonths: 12,
    }),
  },
  {
    id: 'edge-emi-included-not-double',
    archetype: 'emi_included',
    note: 'EMI is already inside expenses and must not be added twice.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 50000,
      accessibleSavings: 150000,
      emiPayments: 10000,
      emiIncludedInExpenses: true,
      goal: 'debt_repayment',
    }),
  },
  {
    id: 'edge-emi-separate',
    archetype: 'emi_separate',
    note: 'EMI is paid separately and must be added exactly once.',
    input: baseProfile({
      monthlyIncome: 100000,
      monthlyExpenses: 50000,
      accessibleSavings: 150000,
      emiPayments: 10000,
      emiIncludedInExpenses: false,
      goal: 'debt_repayment',
    }),
  },
  {
    id: 'edge-zero-savings',
    archetype: 'zero_savings',
    note: 'Accessible savings are zero.',
    input: baseProfile({
      monthlyIncome: 60000,
      monthlyExpenses: 30000,
      accessibleSavings: 0,
    }),
  },
  {
    id: 'edge-target-tiny',
    archetype: 'tiny_goal',
    note: 'A tiny remaining amount still needs one whole month.',
    input: baseProfile({
      monthlyIncome: 50000,
      monthlyExpenses: 10000,
      accessibleSavings: 50000,
      targetAmount: 1,
      monthlySavingsCapacity: 3,
    }),
  },
  {
    id: 'edge-large-values',
    archetype: 'large_values',
    note: 'Large monetary values exercise numeric stability.',
    input: baseProfile({
      monthlyIncome: 10000000,
      monthlyExpenses: 4000000,
      accessibleSavings: 10000000,
      goal: 'home_purchase',
      targetAmount: 50000000,
      currentGoalSavings: 10000000,
      monthlySavingsCapacity: 500000,
      goalTimelineMonths: 60,
    }),
  },
]);

export function normalizeConfig(config = {}) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  const seed = Number(merged.seed);
  const profiles = Number(merged.profiles);

  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error('Experiment seed must be a non-negative whole number.');
  }
  if (!Number.isInteger(profiles) || profiles < 1 || profiles > 100000) {
    throw new Error('Profile count must be a whole number between 1 and 100000.');
  }

  const normalizedThresholds = normalizeTwinThresholds(merged.thresholds);

  return {
    experimentVersion: String(merged.experimentVersion),
    seed,
    profiles,
    includeEdgeCases: merged.includeEdgeCases !== false,
    asOfDate: resolveAsOfDate(merged.asOfDate),
    thresholds: {
      lowMandatoryCoverageMonths:
        normalizedThresholds.lowMandatoryCoverageMonths,
      highEmiBurdenPct: normalizedThresholds.highEmiBurdenPct,
    },
  };
}

export function generateDataset(config = {}) {
  const normalized = normalizeConfig(config);
  const rng = mulberry32(normalized.seed);

  const randomProfiles = [];
  for (let index = 0; index < normalized.profiles; index += 1) {
    const archetype =
      RANDOM_ARCHETYPES[index % RANDOM_ARCHETYPES.length];
    randomProfiles.push(
      makeRandomProfile(rng, index, archetype, normalized)
    );
  }

  const edgeProfiles = normalized.includeEdgeCases
    ? EDGE_CASES.map((edgeCase) => ({
        id: `syn-${edgeCase.id}`,
        source: 'synthetic',
        archetype: edgeCase.archetype,
        note: edgeCase.note,
        asOfDate: edgeCase.asOfDate ?? normalized.asOfDate,
        ...edgeCase.input,
      }))
    : [];

  const profiles = [...randomProfiles, ...edgeProfiles];
  const archetypeCounts = {};
  for (const profile of profiles) {
    archetypeCounts[profile.archetype] =
      (archetypeCounts[profile.archetype] || 0) + 1;
  }

  return {
    schemaVersion: DATASET_VERSION,
    seed: normalized.seed,
    asOfDate: normalized.asOfDate,
    thresholds: normalized.thresholds,
    profiles,
    meta: {
      source: 'synthetic',
      realData: false,
      requestedRandomProfiles: normalized.profiles,
      randomProfiles: randomProfiles.length,
      edgeCaseProfiles: edgeProfiles.length,
      totalProfiles: profiles.length,
      randomArchetypes: [...RANDOM_ARCHETYPES],
      archetypeCounts,
      scenarios: {
        basePerProfile: SCENARIO_NAMES.length - 1,
        conditionalGoalContribution: 1,
      },
    },
  };
}

/**
 * Build the deterministic scenario suite for one profile. Blank/omitted fields
 * inherit the baseline, matching the Digital Twin UI semantics.
 */
export function buildScenarios(profile) {
  const I = profile.monthlyIncome;
  const E = profile.monthlyExpenses;
  const M = profile.emiPayments;
  const S = profile.accessibleSavings;
  const P = I - (E + (profile.emiIncludedInExpenses ? 0 : M));

  const scenarios = [
    {
      name: 'income_up',
      overrides: {
        monthlyIncome: I + Math.max(1000, roundTo(I * 0.1, 100)),
      },
    },
    {
      name: 'expenses_up',
      overrides: {
        monthlyExpenses: E + Math.max(1000, roundTo(E * 0.1, 100)),
      },
    },
    {
      name: 'emi_up',
      overrides: {
        emiPayments: M + 5000,
      },
    },
    {
      name: 'savings_up',
      overrides: {
        accessibleSavings: S + Math.max(5000, roundTo(S * 0.25, 100)),
      },
    },
    {
      name: 'shock',
      overrides: {
        unexpectedExpense: roundTo(S * 1.5 + 10000, 100),
      },
    },
    {
      name: 'combined_stress',
      overrides: {
        monthlyIncome: Math.max(
          0,
          I - Math.max(1000, roundTo(I * 0.1, 100))
        ),
        monthlyExpenses: E + Math.max(1000, roundTo(E * 0.1, 100)),
        unexpectedExpense: roundTo(S * 0.5 + 1000, 100),
      },
    },
  ];

  if (profile.targetAmount !== null) {
    const baseContribution =
      profile.monthlySavingsCapacity ?? Math.max(0, P);
    scenarios.push({
      name: 'goal_contribution_up',
      overrides: {
        monthlySavingsCapacity:
          baseContribution +
          Math.max(1000, roundTo(baseContribution * 0.1, 100)),
      },
    });
  }

  return scenarios.map((scenario) => ({
    id: `${profile.id}-${scenario.name}`,
    name: scenario.name,
    overrides: scenario.overrides,
  }));
}
