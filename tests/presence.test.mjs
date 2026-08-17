import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregatePresence,
  presenceActiveWindowMs,
} from '../functions/_lib/presence.js';

const now = Date.parse('2026-08-01T12:00:00.000Z');

test('the freshest active device wins without awkward source wording', () => {
  const presence = aggregatePresence([
    { device: 'phone', state: 'online', updatedAt: '2026-08-01T11:59:00.000Z' },
    { device: 'pc', state: 'away', updatedAt: '2026-08-01T11:59:30.000Z' },
  ], { showDevice: true }, now);

  assert.deepEqual(presence, {
    status: 'away',
    device: 'PC',
    lastSeen: '2026-08-01T11:59:30.000Z',
  });
});

test('a stale heartbeat becomes offline but keeps last seen metadata', () => {
  const timestamp = new Date(now - presenceActiveWindowMs - 1).toISOString();
  assert.deepEqual(
    aggregatePresence([{ device: 'pc', state: 'online', updatedAt: timestamp }], {}, now),
    { status: 'offline', device: 'PC', lastSeen: timestamp },
  );
});

test('an offline device does not hide another active device', () => {
  const presence = aggregatePresence([
    { device: 'phone', state: 'offline', updatedAt: '2026-08-01T11:59:50.000Z' },
    { device: 'pc', state: 'online', updatedAt: '2026-08-01T11:59:20.000Z' },
  ], { showDevice: true }, now);
  assert.deepEqual(presence, {
    status: 'online',
    device: 'PC',
    lastSeen: '2026-08-01T11:59:20.000Z',
  });
});

test('device visibility can be disabled without hiding the status', () => {
  const presence = aggregatePresence([
    { device: 'phone', state: 'online', updatedAt: '2026-08-01T11:59:30.000Z' },
  ], { showDevice: false }, now);
  assert.equal(presence.status, 'online');
  assert.equal(presence.device, null);
});

test('invisible mode leaks neither device nor last seen', () => {
  const presence = aggregatePresence([
    { device: 'pc', state: 'online', updatedAt: '2026-08-01T11:59:30.000Z' },
  ], { invisible: true, showDevice: true }, now);
  assert.deepEqual(presence, { status: 'offline', device: null, lastSeen: null });
});
