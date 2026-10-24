import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDays } from '../scripts/days.mjs';
import { localDateString } from '../scripts/day-sources/time.mjs';

test('Minecraft is one supported game with an expandable Hypixel category', () => {
  const html = renderDays([{
    date: localDateString(),
    gaming: [{
      title: 'Minecraft', minutes: 47,
      cover: 'https://images.igdb.com/igdb/image/upload/t_original/coa77e.jpg',
      supported: true, hypixel: {
        modes: [
          { title: 'Bed Wars', plays: 3, minutes: 4.9, insights: {'W / L': '2 / 1'} },
          { title: 'SkyWars', plays: 1, insights: {'K / D': '3 / 1'} },
        ],
      },
    }],
  }], {history:[]});
  assert.match(html, /day-game-minecraft/);
  assert.match(html, /<strong>Minecraft<\/strong>/);
  assert.match(html, />HYPIXEL</);
  assert.match(html, /class="day-hypixel-mode"/);
  assert.match(html, />Bed Wars</);
  assert.match(html, />SkyWars</);
  assert.match(html, /~5m observed/);
  assert.match(html, /47m.*Hypixel/);
  assert.doesNotMatch(html, /Minecraft: Bed Wars/);
  assert.equal((html.match(/class="day-game-insight day-game-minecraft"/g) || []).length, 1);
});

test('Hypixel values and mode names are HTML escaped', () => {
  const html = renderDays([{
    date: localDateString(),
    gaming: [{
      title: 'Minecraft', supported: true, hypixel: {
        modes: [
          {title: '<img src=x onerror=alert(1)>', insights: {'<b>test</b>': '<script>bad()</script>'}},
        ],
      },
    }],
  }], {history:[]});
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;test&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>bad/);
});
