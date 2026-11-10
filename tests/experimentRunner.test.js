import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExperiment } from '../experiments/lib/runner.js';
import {
  ARTIFACT_FILES,
  verifyRunManifest,
  writeArtifacts,
} from '../experiments/lib/artifacts.js';
import { stableStringify } from '../experiments/lib/metrics.js';

const TEST_CONFIG = Object.freeze({ seed: 123, profiles: 10 });

describe('Phase 4 experiment runner', () => {
  it('evaluates the documented denominators and records no failures', () => {
    const run = runExperiment(TEST_CONFIG);
    const summary = run.summary;

    assert.equal(summary.profiles.randomProfiles, 10);
    assert.equal(summary.profiles.edgeCaseProfiles, 26);
    assert.equal(summary.profiles.totalProfiles, 36);
    assert.equal(summary.results.baselineResults, 36);
    assert.equal(
      summary.results.totalResults,
      36 + summary.scenarios.totalCases
    );
    assert.equal(
      summary.assertions.formula.total,
      14 * summary.results.totalResults
    );
    assert.equal(
      summary.assertions.goal.total,
      11 * summary.results.totalResults
    );
    assert.equal(
      summary.assertions.recommendationDecisions.total,
      7 * summary.results.totalResults
    );
    assert.equal(
      summary.assertions.comparison.total,
      summary.scenarios.totalCases * 105
    );
    assert.equal(
      summary.assertions.determinism.total,
      summary.results.totalResults
    );
    assert.equal(summary.assertions.validationInvalid.total, 31);
    assert.equal(summary.assertions.validationValid.total, 5);
    assert.ok(summary.assertions.invariants.applicable > 0);
    assert.ok(summary.assertions.explainability.total > 0);
    assert.equal(summary.totalFailureCount, 0);
    assert.equal(run.failures.length, 0);
  });

  it('is reproducible for the same seed and changes with a different seed', () => {
    const first = runExperiment(TEST_CONFIG);
    const second = runExperiment(TEST_CONFIG);
    const other = runExperiment({ ...TEST_CONFIG, seed: 124 });

    assert.equal(stableStringify(first), stableStringify(second));
    assert.notEqual(
      stableStringify(first.dataset.profiles),
      stableStringify(other.dataset.profiles)
    );
    assert.equal(other.summary.totalFailureCount, 0);
  });

  it('writes immutable artifacts, verifies checksums, and detects tampering', () => {
    const resultsDir = mkdtempSync(join(tmpdir(), 'wg-phase4-artifacts-'));
    const timestamp = new Date('2026-10-27T12:00:00Z');
    const environment = {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      dependencies: { 'root package': '0.1.0' },
    };

    try {
      const run = runExperiment({ seed: 321, profiles: 4 });
      const first = writeArtifacts(run, {
        resultsDir,
        timestamp,
        environment,
      });

      for (const file of ARTIFACT_FILES) {
        assert.ok(
          existsSync(join(first.runDir, file)),
          `missing artifact ${file}`
        );
      }

      const verification = verifyRunManifest(first.runDir);
      assert.equal(verification.ok, true);
      assert.equal(verification.mismatches.length, 0);

      const runDocument = JSON.parse(
        readFileSync(join(first.runDir, 'run.json'), 'utf8')
      );
      assert.equal(runDocument.meta.seed, 321);
      assert.equal(runDocument.summary.totalFailureCount, 0);
      assert.equal(runDocument.rows, undefined);
      assert.equal(runDocument.dataset.profiles, undefined);

      const report = readFileSync(join(first.runDir, 'report.md'), 'utf8');
      assert.match(report, /synthetic/i);
      assert.match(report, /Random seed \| 321/);
      assert.match(report, /Formula correctness/);
      assert.match(report, /not real people/i);

      const profilesCsv = readFileSync(
        join(first.runDir, 'profiles.csv'),
        'utf8'
      );
      assert.ok(profilesCsv.startsWith('id,source,archetype'));

      const comparisonCsv = readFileSync(
        join(first.runDir, 'comparison-results.csv'),
        'utf8'
      );
      assert.match(comparisonCsv, /baselineConsistency/);
      assert.match(comparisonCsv, /goalProjection/);

      const failuresCsv = readFileSync(
        join(first.runDir, 'failures.csv'),
        'utf8'
      );
      assert.ok(failuresCsv.startsWith('category,scope,caseId'));

      const second = writeArtifacts(run, {
        resultsDir,
        timestamp,
        environment,
      });
      assert.notEqual(second.runDir, first.runDir);
      assert.ok(second.runDir.endsWith('-02'));
      assert.equal(verifyRunManifest(first.runDir).ok, true);

      const publishedPath = join(resultsDir, 'published.md');
      const third = writeArtifacts(run, {
        resultsDir,
        timestamp,
        environment,
        publishDocPath: publishedPath,
      });
      assert.ok(existsSync(publishedPath));
      assert.equal(
        readFileSync(publishedPath, 'utf8'),
        readFileSync(join(third.runDir, 'report.md'), 'utf8')
      );

      writeFileSync(
        join(second.runDir, 'metric-results.csv'),
        'tampered',
        'utf8'
      );
      const tampered = verifyRunManifest(second.runDir);
      assert.equal(tampered.ok, false);
      assert.equal(tampered.mismatches.length, 1);
      assert.equal(tampered.mismatches[0].name, 'metric-results.csv');
    } finally {
      rmSync(resultsDir, { recursive: true, force: true });
    }
  });
});
