/**
 * Renders every curated lesson from the live backend through the real
 * CuratedLessonView component to catch blank-modal regressions.
 * Run: node scripts/renderAllCuratedLessons.mjs [baseUrl]
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from '../frontend/node_modules/esbuild/lib/main.js';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendModules = path.join(projectRoot, 'frontend', 'node_modules');

const entryPath = path.join(projectRoot, 'scripts', 'curated-render-entry.tmp.jsx');
const outfile = path.join(projectRoot, 'scripts', 'curated-render-bundle.tmp.cjs');

fs.writeFileSync(
  entryPath,
  [
    `import { renderToStaticMarkup } from 'react-dom/server';`,
    `import React from 'react';`,
    `import CuratedLessonView from '../frontend/src/components/learning/CuratedLessonView.jsx';`,
    `import { normalizeCuratedLessonResponse } from '../frontend/src/utils/curatedLesson.js';`,
    `module.exports = { CuratedLessonView, normalizeCuratedLessonResponse, renderToStaticMarkup, React };`,
  ].join('\n')
);

await esbuild.build({
  entryPoints: [entryPath],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  jsx: 'automatic',
  nodePaths: [frontendModules],
  external: ['electron'],
  logLevel: 'silent',
});

const bundled = require(outfile);
const { CuratedLessonView, normalizeCuratedLessonResponse, renderToStaticMarkup, React } = bundled;

const baseUrl = process.argv[2] || 'http://localhost:5001';
const listedRes = await fetch(`${baseUrl}/api/learn/lessons`);
const listed = await listedRes.json();

let failures = 0;
let rendered = 0;
const percentSelectors = ['setup?', 'explanation', 'quiz', 'examples', 'title'];

for (const meta of listed.lessons) {
  try {
    const entryRes = await fetch(`${baseUrl}/api/learn/lessons/${meta.conceptId}`);
    const body = await entryRes.json();
    const normalized = normalizeCuratedLessonResponse(body);

    if (!normalized.ok) {
      failures += 1;
      console.log(`NORMALIZE FAIL ${meta.conceptId}: ${normalized.reason}`);
      continue;
    }

    const html = renderToStaticMarkup(
      React.createElement(CuratedLessonView, {
        entry: normalized.entry,
        isCompleted: false,
        onComplete: () => ({ ok: true }),
        onQuizProgress: () => {},
        onAskGenie: () => {},
        onClose: () => {},
      })
    );

    // The lesson title itself is rendered by the modal header (LearnPage
    // passes selectedConcept.title); the view just needs its core sections.
    const hasTitle = html.includes('What you will learn');
    const hasQuiz = /(Quick check|Question 1)/.test(html);
    const hasOptions = /radio/.test(html);
    const hasFeedback = /(Check answer|Try again|Correct)/.test(html);
    const hasExamples = /(Worked examples)/.test(html);
    const contentLength = html.length;
    if (html.trim().length < 600 || !hasTitle || !hasQuiz || !hasOptions) {
      failures += 1;
      console.log(
        `RENDER INCOMPLETE ${meta.conceptId}: title=${hasTitle} quiz=${hasQuiz} options=${hasOptions} feedback=${hasFeedback} examples=${hasExamples} length=${contentLength}`
      );
    } else {
      rendered += 1;
    }
  } catch (error) {
    failures += 1;
    console.log(`RENDER CRASH ${meta.conceptId}: ${error.message}`);
  }
}

console.log(`rendered: ${rendered} failed: ${failures} of ${listed.lessons.length}`);
fs.rmSync(outfile, { force: true });
fs.rmSync(entryPath, { force: true });
process.exit(failures > 0 ? 1 : 0);
