import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadDays } from '../scripts/days.mjs';

async function fixture(note) {
  const root = await mkdtemp(path.join(tmpdir(), 'days-note-'));
  await mkdir(path.join(root, 'content', 'days'), { recursive: true });
  await mkdir(path.join(root, 'content', 'day-notes'), { recursive: true });
  await writeFile(path.join(root, 'content', 'days', '2099-01-01.yaml'), 'date: 2099-01-01\n');
  await writeFile(path.join(root, 'content', 'day-notes', '2099-01-01.md'), note);
  return root;
}

test('fresh day notes stay pending by default', async () => {
  const [day] = await loadDays(await fixture('still private'));
  assert.equal(day.note, null);
  assert.equal(day.notePending, true);
});

test('publish: now frontmatter publishes a fresh day note immediately', async () => {
  const [day] = await loadDays(await fixture('---\npublish: now\n---\n\nhello `world`'));
  assert.equal(day.notePending, false);
  assert.match(day.note, /hello <code>world<\/code>/);
  assert.ok(!day.note.includes('publish: now'));
});
