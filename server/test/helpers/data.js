// Loads the pack's seed data from disk for tests (no DB needed for this part).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/test/helpers -> repo/data
export const DATA_DIR = path.resolve(here, '../../../data');

export const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
export const readJsonl = (file) =>
  fs
    .readFileSync(path.join(DATA_DIR, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

export const indexBy = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r]));
