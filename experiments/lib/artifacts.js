/**
 * Artifact writer for the Phase 4 experiment.
 *
 * A run is written to a new timestamped directory and is never overwritten.
 * Every machine-readable file is also listed in `manifest.json` with a SHA-256
 * checksum so a later reviewer can verify that artifacts were not altered.
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { toCsv } from './metrics.js';
import { renderReport } from './report.js';

const PROFILE_COLUMNS = Object.freeze([
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

const SCENARIO_COLUMNS = Object.freeze([
  'id',
  'profileId',
  'name',
  'overrides',
]);

const METRIC_COLUMNS = Object.freeze([
  'scope',
  'caseId',
  'profileId',
  'scenarioId',
  'scenarioName',
  'metric',
  'expected',
  'actual',
  'pass',
  'absError',
  'nullMismatch',
]);

const GOAL_COLUMNS = Object.freeze([
  'scope',
  'caseId',
  'profileId',
  'scenarioId',
  'scenarioName',
  'group',
  'field',
  'expected',
  'actual',
  'pass',
]);

const COMPARISON_COLUMNS = Object.freeze([
  'scope',
  'caseId',
  'profileId',
  'scenarioId',
  'scenarioName',
  'group',
  'metric',
  'checks',
  'passed',
  'failed',
  'failedFields',
  'expected',
  'actual',
  'pass',
]);

const RECOMMENDATION_COLUMNS = Object.freeze([
  'scope',
  'caseId',
  'profileId',
  'scenarioId',
  'scenarioName',
  'kind',
  'recommendationId',
  'expected',
  'actual',
  'pass',
]);

const VALIDATION_COLUMNS = Object.freeze([
  'category',
  'caseId',
  'target',
  'field',
  'expectedMessage',
  'rejected',
  'accepted',
  'errorMessage',
  'messageMatches',
  'messageQuality',
  'pass',
]);

const INVARIANT_COLUMNS = Object.freeze([
  'invariant',
  'profileId',
  'applicable',
  'pass',
  'metric',
  'delta',
  'baselineValue',
  'perturbedValue',
  'note',
]);

const EXPLAINABILITY_SUMMARY_COLUMNS = Object.freeze([
  'check',
  'category',
  'passed',
  'total',
  'failed',
  'rate',
  'baselinePassed',
  'baselineTotal',
  'scenarioPassed',
  'scenarioTotal',
]);

const EXPLAINABILITY_FAILURE_COLUMNS = Object.freeze([
  'scope',
  'caseId',
  'profileId',
  'scenarioId',
  'scenarioName',
  'check',
  'detail',
]);

const FAILURE_COLUMNS = Object.freeze([
  'category',
  'scope',
  'caseId',
  'profileId',
  'scenarioId',
  'scenarioName',
  'field',
  'check',
  'invariant',
  'metric',
  'expected',
  'actual',
  'detail',
]);

export const ARTIFACT_FILES = Object.freeze([
  'run.json',
  'dataset.json',
  'profiles.csv',
  'scenario-cases.csv',
  'metric-results.csv',
  'goal-results.csv',
  'comparison-results.csv',
  'recommendation-results.csv',
  'validation-results.csv',
  'invariants.csv',
  'explainability-summary.csv',
  'explainability-failures.csv',
  'failures.csv',
  'report.md',
  'manifest.json',
]);

function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function timestampSlug(timestamp) {
  return timestamp
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function createRunDirectory(resultsDir, config, timestamp = new Date()) {
  mkdirSync(resultsDir, { recursive: true });

  const base = `run-${timestampSlug(timestamp)}-seed-${config.seed}`;
  let candidate = join(resultsDir, base);
  let suffix = 1;

  while (existsSync(candidate)) {
    suffix += 1;
    candidate = join(resultsDir, `${base}-${String(suffix).padStart(2, '0')}`);
  }

  mkdirSync(candidate, { recursive: false });
  const relativePath = relative(process.cwd(), candidate).replace(/\\/g, '/');
  return {
    runDir: candidate,
    runDirName:
      relativePath.startsWith('..') || isAbsolute(relativePath)
        ? candidate
        : relativePath,
  };
}

function buildRunDocument(run, { generatedAt, environment, runDirName }) {
  const { rows, dataset, ...rest } = run;

  return {
    ...rest,
    generatedAt,
    environment,
    runDirectory: runDirName,
    dataset: {
      schemaVersion: dataset.schemaVersion,
      seed: dataset.seed,
      asOfDate: dataset.asOfDate,
      thresholds: dataset.thresholds,
      meta: dataset.meta,
    },
    artifacts: ARTIFACT_FILES,
    storedExplainabilityFailures: rows.explainabilityFailures.length,
  };
}

function explainabilitySummaryRows(run) {
  return Object.entries(run.results.explainability.byCheck).map(
    ([check, entry]) => ({
      check,
      category: entry.category,
      passed: entry.overall.passed,
      total: entry.overall.total,
      failed: entry.overall.failed,
      rate: entry.overall.rate,
      baselinePassed: entry.baseline.passed,
      baselineTotal: entry.baseline.total,
      scenarioPassed: entry.scenario.passed,
      scenarioTotal: entry.scenario.total,
    })
  );
}

function compactComparisonRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    const key = [row.caseId, row.group].join('|');
    let group = groups.get(key);
    if (!group) {
      group = {
        scope: row.scope,
        caseId: row.caseId,
        profileId: row.profileId,
        scenarioId: row.scenarioId,
        scenarioName: row.scenarioName,
        group: row.group,
        metric:
          row.group === 'metric' || row.group === 'goalProjection'
            ? 'all'
            : row.metric,
        checks: 0,
        passed: 0,
        failed: 0,
        failedFields: [],
        expected: row.expected,
        actual: row.actual,
      };
      groups.set(key, group);
    }

    group.checks += 1;
    if (row.pass) {
      group.passed += 1;
    } else {
      group.failed += 1;
      group.failedFields.push(`${row.metric}.${row.field}`);
    }

    if (row.group === 'recommendations' || row.group === 'baselineConsistency') {
      group.expected = row.expected;
      group.actual = row.actual;
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    failedFields: group.failedFields.join('|'),
    pass: group.failed === 0,
  }));
}

function buildFileContents(run, { generatedAt, environment, runDirName }) {
  const rows = run.rows;

  return {
    'dataset.json': `${JSON.stringify(
      {
        schemaVersion: run.dataset.schemaVersion,
        seed: run.dataset.seed,
        asOfDate: run.dataset.asOfDate,
        thresholds: run.dataset.thresholds,
        meta: run.dataset.meta,
        profiles: run.dataset.profiles,
      },
      null,
      2
    )}\n`,
    'profiles.csv': toCsv(run.dataset.profiles, PROFILE_COLUMNS),
    'scenario-cases.csv': toCsv(
      rows.scenarioCases.map((scenario) => ({
        ...scenario,
        overrides: JSON.stringify(scenario.overrides),
      })),
      SCENARIO_COLUMNS
    ),
    'metric-results.csv': toCsv(rows.metricResults, METRIC_COLUMNS),
    'goal-results.csv': toCsv(rows.goalResults, GOAL_COLUMNS),
    'comparison-results.csv': toCsv(
      compactComparisonRows(rows.comparisonResults),
      COMPARISON_COLUMNS
    ),
    'recommendation-results.csv': toCsv(
      rows.recommendationResults,
      RECOMMENDATION_COLUMNS
    ),
    'validation-results.csv': toCsv(
      rows.validationResults,
      VALIDATION_COLUMNS
    ),
    'invariants.csv': toCsv(rows.invariantResults, INVARIANT_COLUMNS),
    'explainability-summary.csv': toCsv(
      explainabilitySummaryRows(run),
      EXPLAINABILITY_SUMMARY_COLUMNS
    ),
    'explainability-failures.csv': toCsv(
      rows.explainabilityFailures,
      EXPLAINABILITY_FAILURE_COLUMNS
    ),
    'failures.csv': toCsv(run.failures, FAILURE_COLUMNS),
    'report.md': renderReport(run, {
      generatedAt,
      environment,
      runDirName,
    }),
    'run.json': `${JSON.stringify(
      buildRunDocument(run, { generatedAt, environment, runDirName }),
      null,
      2
    )}\n`,
  };
}

/**
 * Write all artifacts for a run. Returns the run directory, manifest, and the
 * exact file list. Existing run directories are never reused.
 */
export function writeArtifacts(
  run,
  {
    resultsDir,
    timestamp = new Date(),
    environment = {},
    publishDocPath = null,
  } = {}
) {
  if (!resultsDir) {
    throw new Error('A results directory is required to write artifacts.');
  }

  const generatedAt = timestamp.toISOString();
  const { runDir, runDirName } = createRunDirectory(
    resultsDir,
    run.config,
    timestamp
  );

  const fileContents = buildFileContents(run, {
    generatedAt,
    environment,
    runDirName,
  });

  const files = [];
  for (const [name, content] of Object.entries(fileContents)) {
    const fullPath = join(runDir, name);
    writeFileSync(fullPath, content, 'utf8');
    files.push({
      name,
      bytes: Buffer.byteLength(content, 'utf8'),
      sha256: sha256(content),
    });
  }

  const manifest = {
    runDirectory: runDirName,
    generatedAt,
    experimentVersion: run.meta.experimentVersion,
    datasetSchemaVersion: run.dataset.schemaVersion,
    seed: run.config.seed,
    node: environment.node ?? null,
    files,
  };

  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(runDir, 'manifest.json'), manifestContent, 'utf8');
  files.push({
    name: 'manifest.json',
    bytes: Buffer.byteLength(manifestContent, 'utf8'),
    sha256: sha256(manifestContent),
  });

  if (publishDocPath) {
    mkdirSync(dirname(publishDocPath), { recursive: true });
    writeFileSync(publishDocPath, fileContents['report.md'], 'utf8');
  }

  return {
    runDir,
    runDirName,
    manifest,
    files,
    reportPath: join(runDir, 'report.md'),
  };
}

/**
 * Verify every checksum in a run's manifest. Used by the CLI and tests.
 */
export function verifyRunManifest(runDir) {
  const manifestPath = join(runDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const mismatches = [];

  for (const file of manifest.files) {
    const fullPath = join(runDir, file.name);
    if (!existsSync(fullPath)) {
      mismatches.push({ name: file.name, reason: 'missing' });
      continue;
    }

    const content = readFileSync(fullPath, 'utf8');
    const actual = sha256(content);
    if (actual !== file.sha256) {
      mismatches.push({
        name: file.name,
        reason: 'checksum',
        expected: file.sha256,
        actual,
      });
    }
  }

  return {
    ok: mismatches.length === 0,
    manifest,
    mismatches,
  };
}
