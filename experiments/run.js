#!/usr/bin/env node
/**
 * Phase 4 experiment CLI.
 *
 * Usage:
 *   node experiments/run.js
 *   node experiments/run.js --seed 20261027 --profiles 200
 *   node experiments/run.js --publish-doc
 *   node experiments/run.js --verify experiments/results/<run>
 *
 * The default config lives in experiments/config/default.json. Generated
 * artifacts go to a new timestamped directory under experiments/results/ and
 * are never overwritten.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { runExperiment } from './lib/runner.js';
import { verifyRunManifest, writeArtifacts } from './lib/artifacts.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CONFIG_PATH = join(
  ROOT,
  'experiments',
  'config',
  'default.json'
);
const DEFAULT_RESULTS_DIR = join(ROOT, 'experiments', 'results');
const PUBLISH_DOC_PATH = join(ROOT, 'docs', 'RESEARCH_EVALUATION.md');

function usage() {
  return `WealthGenie Phase 4 experiment runner

Usage:
  node experiments/run.js [options]

Options:
  --config <path>          Config JSON file (default: experiments/config/default.json)
  --seed <integer>         Override the random seed
  --profiles <integer>     Override the number of random profiles
  --no-edge-cases          Exclude the deterministic edge-case profiles
  --include-edge-cases     Include the deterministic edge-case profiles
  --as-of <YYYY-MM-DD>     Override the fixed as-of date
  --low-coverage <number>  Override the low mandatory-outflow coverage threshold
  --high-emi <number>      Override the high EMI burden threshold (%)
  --out <directory>        Results directory (default: experiments/results)
  --timestamp <ISO date>   Override the run-directory timestamp (testing only)
  --publish-doc            Also write docs/RESEARCH_EVALUATION.md
  --allow-failures         Exit 0 even when assertions fail
  --verify <run-dir>       Verify a run manifest and exit
  --quiet                  Suppress the summary
  --help                   Show this help
`;
}

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=');
    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[rawKey] = next;
      index += 1;
    } else {
      args[rawKey] = true;
    }
  }

  return args;
}

function readPackageVersion(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function getEnvironment() {
  const userAgent = process.env.npm_config_user_agent || '';
  const npmMatch = userAgent.match(/npm\/([^\s]+)/);

  return {
    node: process.version,
    npm: npmMatch ? npmMatch[1] : null,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    cwd: process.cwd(),
    dependencies: {
      'root package': readPackageVersion(join(ROOT, 'package.json')),
      'backend package': readPackageVersion(
        join(ROOT, 'backend', 'package.json')
      ),
      'frontend package': readPackageVersion(
        join(ROOT, 'frontend', 'package.json')
      ),
    },
  };
}

function numericArg(args, key) {
  if (args[key] === undefined) return undefined;
  const value = Number(args[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`--${key} must be a finite number.`);
  }
  return value;
}

function formatCounter(counter) {
  if (!counter || counter.total === 0) return 'n/a (0/0)';
  return `${(counter.rate * 100).toFixed(2)}% (${counter.passed}/${counter.total})`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  if (args.verify) {
    const runDir = resolve(ROOT, String(args.verify));
    const result = verifyRunManifest(runDir);

    if (result.ok) {
      process.stdout.write(
        `Manifest verified: ${result.manifest.files.length} files match ${runDir}\n`
      );
    } else {
      process.stderr.write(
        `Manifest verification failed for ${runDir}:\n${result.mismatches
          .map((item) => `  - ${item.name}: ${item.reason}`)
          .join('\n')}\n`
      );
      process.exitCode = 1;
    }
    return;
  }

  const configPath = args.config
    ? resolve(ROOT, String(args.config))
    : DEFAULT_CONFIG_PATH;
  const baseConfig = JSON.parse(readFileSync(configPath, 'utf8'));
  const config = { ...baseConfig };

  if (args.seed !== undefined) config.seed = numericArg(args, 'seed');
  if (args.profiles !== undefined) {
    config.profiles = numericArg(args, 'profiles');
  }
  if (args['no-edge-cases']) config.includeEdgeCases = false;
  if (args['include-edge-cases']) config.includeEdgeCases = true;
  if (args['as-of'] !== undefined) config.asOfDate = String(args['as-of']);

  const lowCoverage = numericArg(args, 'low-coverage');
  const highEmi = numericArg(args, 'high-emi');
  if (lowCoverage !== undefined || highEmi !== undefined) {
    config.thresholds = {
      ...(config.thresholds || {}),
      ...(lowCoverage !== undefined
        ? { lowMandatoryCoverageMonths: lowCoverage }
        : {}),
      ...(highEmi !== undefined ? { highEmiBurdenPct: highEmi } : {}),
    };
  }

  const timestamp = args.timestamp
    ? new Date(String(args.timestamp))
    : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('--timestamp must be a valid ISO date.');
  }

  const resultsDir = args.out
    ? resolve(ROOT, String(args.out))
    : DEFAULT_RESULTS_DIR;
  const environment = getEnvironment();
  const run = runExperiment(config);

  const artifacts = writeArtifacts(run, {
    resultsDir,
    timestamp,
    environment,
    publishDocPath: args['publish-doc'] ? PUBLISH_DOC_PATH : null,
  });

  const verification = verifyRunManifest(artifacts.runDir);
  if (!verification.ok) {
    process.stderr.write(
      `Artifact manifest verification failed for ${artifacts.runDir}.\n`
    );
    process.exitCode = 1;
  }

  if (!args.quiet) {
    const summary = run.summary;
    const lines = [
      'WealthGenie Phase 4 experiment',
      `Run directory: ${artifacts.runDirName}`,
      `Seed: ${run.config.seed} | profiles: ${summary.profiles.totalProfiles} | scenarios: ${summary.scenarios.totalCases} | results: ${summary.results.totalResults}`,
      `Formula: ${formatCounter(summary.assertions.formula)}`,
      `Goal: ${formatCounter(summary.assertions.goal)}`,
      `Recommendation exact set: ${formatCounter(summary.assertions.recommendationExact)}`,
      `Recommendation decisions: ${formatCounter(summary.assertions.recommendationDecisions)}`,
      `Comparison: ${formatCounter(summary.assertions.comparison)}`,
      `Determinism: ${formatCounter(summary.assertions.determinism)}`,
      `Validation invalid: ${summary.assertions.validationInvalid.passed}/${summary.assertions.validationInvalid.total} (${(summary.assertions.validationInvalid.passRate * 100).toFixed(2)}%)`,
      `Validation valid: ${summary.assertions.validationValid.accepted}/${summary.assertions.validationValid.total} (${(summary.assertions.validationValid.acceptanceRate * 100).toFixed(2)}%)`,
      `Invariants: ${formatCounter(summary.assertions.invariants)}`,
      `Explainability: ${formatCounter(summary.assertions.explainability)}`,
      `Failures: ${summary.totalFailureCount} (stored ${summary.storedFailureCount})`,
      `Report: ${artifacts.reportPath}`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);

    if (args['publish-doc']) {
      process.stdout.write(`Published: ${PUBLISH_DOC_PATH}\n`);
    }
  }

  if (run.summary.totalFailureCount > 0 && !args['allow-failures']) {
    process.stderr.write(
      `Experiment recorded ${run.summary.totalFailureCount} failed assertion(s). See failures.csv and report.md.\n`
    );
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.stack || error?.message || error}\n`);
  process.exitCode = 1;
}
