import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { localDateString } from './time.mjs';

export async function collectNow(projectRoot, date) {
  const doc = JSON.parse(await readFile(path.join(projectRoot, 'content', 'now.json'), 'utf8'));
  return doc.history
    .filter((entry) => localDateString(new Date(entry.at)) === date)
    .slice().reverse()
    .map((entry) => ({ at: entry.at, changes: entry.changes }));
}
