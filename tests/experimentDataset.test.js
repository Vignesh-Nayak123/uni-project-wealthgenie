import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EDGE_CASES,
  PROFILE_COLUMNS,
  RANDOM_ARCHETYPES,
  SCENARIO_NAMES,
  buildScenarios,
  generateDataset,
  normalizeConfig,
} from '../experiments/lib/dataset.js';
import { stableStringify } from '../experiments/lib/metrics.js';

describe('Phase 4 synthetic dataset', () => {
  it('is deterministic for a fixed seed and profile count', () => {
    const first = generateDataset({ seed: 42, profiles: 20 });
    const second = generateDataset({ seed: 42, profiles: 20 });

    assert.equal(stableStringify(first), stableStringify(second));
    assert.equal(first.seed, 42);
    assert.equal(first.meta.realData, false);
    assert.equal(first.meta.source, 'synthetic');
  });

  it('changes profiles when the seed changes', () => {
    const first = generateDataset({ seed: 42, profiles: 20 });
    const second = generateDataset({ seed: 43, profiles: 20 });

    assert.notEqual(
      stableStringify(first.profiles),
      stableStringify(second.profiles)
    );
  });

  it('reports counts and marks every profile as synthetic', () => {
    const dataset = generateDataset({ seed: 7, profiles: 20 });

    assert.equal(dataset.meta.requestedRandomProfiles, 20);
    assert.equal(dataset.meta.randomProfiles, 20);
    assert.equal(dataset.meta.edgeCaseProfiles, EDGE_CASES.length);
    assert.equal(
      dataset.meta.totalProfiles,
      20 + EDGE_CASES.length
    );
    assert.equal(dataset.profiles.length, dataset.meta.totalProfiles);
    assert.equal(
      dataset.profiles.filter((profile) => profile.source === 'synthetic')
        .length,
      dataset.profiles.length
    );
    assert.equal(
      new Set(dataset.profiles.map((profile) => profile.id)).size,
      dataset.profiles.length
    );
  });

  it('covers every random archetype and every deterministic edge case', () => {
    const dataset = generateDataset({ seed: 7, profiles: 20 });
    const archetypes = new Set(
      dataset.profiles.map((profile) => profile.archetype)
    );

    for (const archetype of RANDOM_ARCHETYPES) {
      assert.ok(archetypes.has(archetype), `missing archetype ${archetype}`);
    }

    for (const edgeCase of EDGE_CASES) {
      assert.ok(
        dataset.profiles.some(
          (profile) => profile.id === `syn-${edgeCase.id}`
        ),
        `missing edge case ${edgeCase.id}`
      );
    }

    assert.ok(archetypes.has('float_noise'));
    assert.ok(archetypes.has('month_end'));
    assert.ok(archetypes.has('coverage_boundary'));
    assert.ok(archetypes.has('emi_boundary'));
    assert.ok(archetypes.has('zero_everything'));
  });

  it('matches the documented dataset schema field order', () => {
    const schema = JSON.parse(
      readFileSync(
        join(process.cwd(), 'experiments', 'config', 'dataset-schema.json'),
        'utf8'
      )
    );

    assert.deepEqual(Object.keys(schema.fields), [...PROFILE_COLUMNS]);
    assert.equal(schema.source, 'synthetic');
    assert.equal(schema.realData, false);
    assert.equal(schema.isolation.mergedWithFindex, false);
  });

  it('can exclude deterministic edge cases', () => {
    const dataset = generateDataset({
      seed: 1,
      profiles: 5,
      includeEdgeCases: false,
    });

    assert.equal(dataset.meta.edgeCaseProfiles, 0);
    assert.equal(dataset.profiles.length, 5);
  });

  it('normalizes and rejects invalid configuration', () => {
    const normalized = normalizeConfig({
      seed: '7',
      profiles: '3',
      asOfDate: '2026-01-31',
    });

    assert.equal(normalized.seed, 7);
    assert.equal(normalized.profiles, 3);
    assert.equal(normalized.asOfDate, '2026-01-31');

    assert.throws(
      () => normalizeConfig({ seed: -1 }),
      /seed must be a non-negative whole number/
    );
    assert.throws(
      () => normalizeConfig({ profiles: 0 }),
      /Profile count must be a whole number/
    );
    assert.throws(
      () => normalizeConfig({ asOfDate: '2026-02-30' }),
      /valid calendar date/
    );
    assert.throws(
      () => normalizeConfig({ thresholds: { lowMandatoryCoverageMonths: 0 } }),
      /Low mandatory-outflow coverage threshold/
    );
  });

  it('builds the base scenario suite and a conditional goal scenario', () => {
    const dataset = generateDataset({ seed: 11, profiles: 20 });
    const withTarget = dataset.profiles.find(
      (profile) => profile.targetAmount !== null
    );
    const withoutTarget = dataset.profiles.find(
      (profile) => profile.targetAmount === null
    );

    const scenarios = buildScenarios(withTarget);
    assert.ok(scenarios.length >= 7);
    assert.ok(
      scenarios.some((scenario) => scenario.name === 'goal_contribution_up')
    );

    const noGoalScenarios = buildScenarios(withoutTarget);
    assert.equal(
      noGoalScenarios.some(
        (scenario) => scenario.name === 'goal_contribution_up'
      ),
      false
    );

    for (const scenario of scenarios) {
      assert.ok(SCENARIO_NAMES.includes(scenario.name));
      assert.equal(scenario.id, `${withTarget.id}-${scenario.name}`);
      for (const key of Object.keys(scenario.overrides)) {
        assert.ok(
          PROFILE_COLUMNS.includes(key),
          `unexpected scenario override ${key}`
        );
      }
    }
  });
});
