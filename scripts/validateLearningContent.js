#!/usr/bin/env node
import process from 'node:process';
import {
  LEARNING_BRANCHES,
  LEARNING_CONCEPTS,
} from '../backend/src/data/learningRoadmap.js';
import { loadLearningContent } from '../backend/src/content/loadContent.js';
import {
  formatValidationReport,
  validateContentSet,
} from '../backend/src/content/lessonContract.js';

function parseArgs(argv) {
  const options = { requireComplete: false, quiet: false };
  for (const arg of argv) {
    if (arg === '--require-complete') options.requireComplete = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(
    [
      'Usage: node scripts/validateLearningContent.js [options]',
      '',
      'Validates the v1 learning content contract against the curriculum graph.',
      '',
      'Options:',
      '  --require-complete  Treat concepts without a lesson file as errors.',
      '  --quiet             Print only the final result line.',
      '  --help, -h          Show this help.',
    ].join('\n')
  );
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  if (options.help) {
    printHelp();
    return 0;
  }

  const { registry, lessons } = await loadLearningContent();

  const result = validateContentSet({
    branches: LEARNING_BRANCHES,
    concepts: LEARNING_CONCEPTS,
    registry,
    lessons,
    requireComplete: options.requireComplete,
  });

  if (options.quiet) {
    console.log(result.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  } else {
    console.log(formatValidationReport(result));
  }

  return result.ok ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`Validation could not run: ${error.message}`);
    process.exitCode = 1;
  });
