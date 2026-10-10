import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDays } from '../scripts/days.mjs';

test('Beat Saber shares supported stats layout and escapes imported song names', () => {
  const html = renderDays([{date:'2026-10-02', gaming:[{
    title:'Beat Saber', provider:'beatleader', supported:true, minutes:4.8, plays:2,
    cover:'https://images.igdb.com/igdb/image/upload/t_original/co20ux.jpg',
    insights:{'global rank':'#18,700 → #18,650 ↑50', pp:'+12.50', best:'150pp · 95% · <script>song</script>', clears:1, FCs:0},
  }]}], {history:[]});
  assert.match(html,/day-game-beatsaber/);
  assert.match(html,/BEATLEADER/);
  assert.match(html,/2 plays/);
  assert.match(html,/&lt;script&gt;song&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>song<\/script>/);
});
