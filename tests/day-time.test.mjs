import assert from 'node:assert/strict';
import test from 'node:test';
import { localDateString } from '../scripts/day-sources/time.mjs';

test('localDateString always returns YYYY-MM-DD in Moscow time', () => {
  assert.equal(localDateString(new Date('2026-09-08T20:59:59Z')), '2026-09-08');
  assert.equal(localDateString(new Date('2026-09-08T21:00:00Z')), '2026-09-09');
});
