import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_ROOT = fileURLToPath(
  new URL('../../../content/learning/v1/', import.meta.url)
);

export const CONTENT_DIRECTORY = CONTENT_ROOT;
export const SOURCES_PATH = path.join(CONTENT_ROOT, 'sources.json');
export const LESSONS_DIRECTORY = path.join(CONTENT_ROOT, 'lessons');

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

export async function loadSourceRegistry(filePath = SOURCES_PATH) {
  return readJsonFile(filePath);
}

export async function loadLessons(directory = LESSONS_DIRECTORY) {
  if (!existsSync(directory)) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  const lessonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();

  const lessons = [];
  for (const fileName of lessonFiles) {
    const filePath = path.join(directory, fileName);
    const lesson = await readJsonFile(filePath);
    lessons.push({ ...lesson, __file: fileName });
  }
  return lessons;
}

export async function loadLearningContent({
  sourcesPath = SOURCES_PATH,
  lessonsDirectory = LESSONS_DIRECTORY,
} = {}) {
  const [registry, lessons] = await Promise.all([
    loadSourceRegistry(sourcesPath),
    loadLessons(lessonsDirectory),
  ]);

  return { registry, lessons };
}
