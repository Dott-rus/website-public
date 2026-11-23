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

test('standalone notes enter the archive on day 14 without creating activity', async () => {
  const root = await fixture('pending activity note');
  await writeFile(path.join(root, 'content/day-notes/2026-11-01.md'), 'standalone **note**');
  assert.equal((await loadDays(root, { today: '2026-11-14' })).length, 1);
  const [activity, standalone] = await loadDays(root, { today: '2026-11-15' });
  assert.equal(activity.date, '2099-01-01');
  assert.equal(activity.notePending, true);
  assert.equal(standalone.date, '2026-11-01');
  assert.equal(standalone.notePending, false);
  assert.deepEqual(standalone.gaming, []);
  assert.match(standalone.note, /standalone <strong>note<\/strong>/);
});

test('immediate standalone notes render external images with Obsidian dimensions', async () => {
  const root = await fixture('pending activity note');
  const image = 'https://assets.example/days/obsidian/' + 'a'.repeat(64) + '.webp';
  await writeFile(path.join(root, 'content/day-notes/2026-11-15.md'),
    `---\npublish: now\n---\n![Image](${image}#width=400&height=200)`);
  const [, note] = await loadDays(root, { today: '2026-11-15' });
  assert.ok(note.note.includes(`src="${image}"`));
  assert.match(note.note, /width="400" height="200"/);
  assert.doesNotMatch(note.note, /#width=|publish: now/);
});


test('published day notes render trusted inline HTML', async () => {
  const [day] = await loadDays(await fixture('---\npublish: now\n---\n\n<span style="background-color:red">red background</span>'));
  assert.match(day.note, /<span style="background-color:red">red background<\/span>/);
});

test('renders rounded redaction placeholders inside published prose', async () => {
  const root = await fixture('---\npublish: now\n---\nBefore :days-redacted[12]: after :days-redacted[900]:');
  const [day] = await loadDays(root);
  assert.match(day.note, /Before <span class="day-redaction"[^>]+style="width:12ch"><\/span> after :days-redacted\[900\]:/);
});
