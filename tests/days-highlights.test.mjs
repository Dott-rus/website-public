import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHighlights, renderDays } from '../scripts/days.mjs';

test('days omit highlights when none are set', () => {
  for (const value of [undefined, null, [], [{}], [{title: ' '}], 'track']) assert.equal(renderHighlights(value), '');
});
test('multiple highlights preserve type, artist and notes and escape authored content', () => {
  const html = renderHighlights([{type:'track', title:'Track <one>', artist:'A & B', note:'<script>bad</script>', url:'javascript:alert(1)'}, {type:'album', title:'Two', url:'https://example.org/album', cover:'https://example.org/cover.png'}]);
  assert.equal((html.match(/<article class="day-highlight[^"]*"/g) || []).length, 2);
  assert.ok(html.includes('Track &lt;one&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('https://example.org/album'));
});
test('highlights appear before the note and activity within a day', () => {
  const html = renderDays([{date:'2026-01-01', highlights:[{title:'Chosen album'}], note:'<p>A note</p>',gaming:[],watching:[],now:[]}], {history:[]});
  assert.ok(html.indexOf('Chosen album') < html.indexOf('A note'));
  assert.ok(html.includes('data-day-entry="2026-01-01"'));
});
