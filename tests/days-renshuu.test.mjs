import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDays } from '../scripts/days.mjs';
import { collectYami } from '../scripts/day-sources/yami.mjs';

test('renshuu is included in static Days using the existing Studied format', async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.YAMI_DAY_URL;
  try {
    process.env.YAMI_DAY_URL = 'https://example.test/day/{date}';
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      gaming: [], watching: [], podcasts: [], japanese: { studied: 20, level: 4 },
    }) });
    const data = await collectYami('2026-11-24');
    assert.equal(data.japanese.studied, 20);
    const html = renderDays([{ date: '2026-11-24', ...data }], { history: [] });
    assert.match(html, /data-kind="japanese"/);
    assert.match(html, /renshuu · 20 studied · Level 4/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.YAMI_DAY_URL;
    else process.env.YAMI_DAY_URL = previousUrl;
  }
});
