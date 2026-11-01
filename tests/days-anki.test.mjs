import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDays } from '../scripts/days.mjs';
import { collectYami } from '../scripts/day-sources/yami.mjs';

test('Anki study history survives daily baking and renders without publishing the private service URL', async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.YAMI_DAY_URL;
  const anki = { reviews: 12, cards: 8, newCards: 3, studySeconds: 125 };
  try {
    process.env.YAMI_DAY_URL = 'https://example.test/day/{date}';
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ gaming: [], watching: [], podcasts: [], anki }) });
    const collected = await collectYami('2026-11-01');
    assert.deepEqual(collected.anki, anki);
    const html = renderDays([{ date: '2026-11-01', ...collected }], { history: [] });
    assert.match(html, /data-kind="anki"/);
    assert.match(html, /12 reviews · 8 cards · 3 new · 2m 5s/);
    assert.doesNotMatch(html, /toki[.]somedott[.]space/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.YAMI_DAY_URL;
    else process.env.YAMI_DAY_URL = previousUrl;
  }
});

test('Anki is omitted on days without reviews and review fields cannot inject HTML', () => {
  const empty = renderDays([{ date: '2026-11-01', anki: { reviews: 0 } }], { history: [] });
  assert.doesNotMatch(empty, /data-kind="anki"/);
  const html = renderDays([{ date: '2026-11-01', anki: { reviews: 2, cards: '<script>bad()</script>', newCards: -5, studySeconds: Infinity } }], { history: [] });
  assert.match(html, /2 reviews · 0 cards · 0 new · 0s/);
  assert.doesNotMatch(html, /<script>bad/);
});
