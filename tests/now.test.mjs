import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyNowUpdate,
  nowHistoryLimit,
  renderNowArchive,
  renderNowHome,
  validateNowDocument,
} from '../scripts/now.mjs';

function emptyDocument() {
  return {
    current: { doing: null, consuming: null, note: null, updatedAt: null },
    history: [],
  };
}

test('a partial update preserves untouched fields and records only changes', () => {
  const document = emptyDocument();
  document.current.doing = 'Writing tests';
  document.current.updatedAt = '2026-07-31T10:00:00.000Z';

  const result = applyNowUpdate(
    document,
    { values: { doing: '', consuming: 'SIGNALIS', note: '' }, clear: {} },
    '2026-07-31T12:00:00.000Z',
  );

  assert.equal(result.changed, true);
  assert.equal(result.document.current.doing, 'Writing tests');
  assert.equal(result.document.current.consuming, 'SIGNALIS');
  assert.deepEqual(result.document.history[0].changes, { consuming: 'SIGNALIS' });
});

test('clear takes priority and a no-op does not create history', () => {
  const document = emptyDocument();
  document.current.note = 'hello';
  document.current.updatedAt = '2026-07-31T10:00:00.000Z';

  const cleared = applyNowUpdate(
    document,
    { values: { note: 'replacement' }, clear: { note: true } },
    '2026-07-31T12:00:00.000Z',
  );
  assert.equal(cleared.document.current.note, null);
  assert.deepEqual(cleared.document.history[0].changes, { note: null });

  const noOp = applyNowUpdate(
    cleared.document,
    { values: { doing: '', consuming: '', note: '' }, clear: { note: true } },
    '2026-07-31T13:00:00.000Z',
  );
  assert.equal(noOp.changed, false);
  assert.equal(noOp.document.history.length, 1);
});

test('history is capped at the configured limit', () => {
  const document = emptyDocument();
  document.history = Array.from({ length: nowHistoryLimit }, (_, index) => ({
    at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    changes: { note: `entry ${index}` },
  }));

  const result = applyNowUpdate(
    document,
    { values: { doing: 'Something' }, clear: {} },
    '2026-07-31T12:00:00.000Z',
  );
  assert.equal(result.document.history.length, nowHistoryLimit);
  assert.deepEqual(result.document.history[0].changes, { doing: 'Something' });
});

test('field limits are validated by Unicode characters', () => {
  const document = emptyDocument();
  assert.throws(
    () => applyNowUpdate(document, { values: { doing: '😺'.repeat(121) } }),
    /maximum is 120/,
  );
});

test('renderers escape content and expose only three updates on home', () => {
  const document = emptyDocument();
  document.current.note = '<script>alert("no")</script>';
  document.current.updatedAt = '2026-07-31T12:00:00.000Z';
  document.history = Array.from({ length: 4 }, (_, index) => ({
    at: new Date(Date.UTC(2026, 6, 31, 12, index)).toISOString(),
    changes: { note: `<entry ${index}>` },
  }));

  const home = renderNowHome(document);
  const archive = renderNowArchive(document);
  assert.doesNotMatch(home, /<script>/);
  assert.match(home, /&lt;script&gt;/);
  assert.equal((home.match(/<li>/g) || []).length, 3);
  assert.equal((archive.match(/<li>/g) || []).length, 4);
});

test('invalid stored content stops the build', () => {
  const document = emptyDocument();
  document.current.note = 'x'.repeat(281);
  assert.throws(() => validateNowDocument(document), /maximum is 280/);
});
