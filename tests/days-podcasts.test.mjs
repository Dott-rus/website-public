import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDays } from '../scripts/days.mjs';
import { localDateString } from '../scripts/day-sources/time.mjs';

test('podcasts render episode, show, listening time and progress', () => {
  const today = localDateString();
  const html = renderDays([{
    date: today,
    gaming: [],
    watching: [],
    podcasts: [{
      title: 'An episode',
      podcast: 'A podcast',
      minutes: 26.4,
      position: 1200,
      total: 2400,
      finished: false,
      cover: 'https://example.test/cover.jpg',
    }],
    music: {},
    code: {},
    now: [],
  }], { history: [] });

  assert.match(html, /<legend>Podcasts<\/legend>/);
  assert.match(html, />An episode</);
  assert.match(html, />A podcast</);
  assert.match(html, />26m · 50%</);
  assert.match(html, />1 podcast</);
});
