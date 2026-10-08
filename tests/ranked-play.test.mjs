import test from 'node:test';
import assert from 'node:assert/strict';
import { rankedPlayForDay } from '../scripts/day-sources/ranked-play.mjs';
const matches=[
  {date:'2026-09-02T18:00:00Z',result:'loss',elo:1200,maps:[{}]},
  {date:'2026-09-03T10:00:00Z',result:'win',elo:1250,maps:[{},{}]},
  {date:'2026-09-03T14:00:00Z',result:'loss',elo:1230,maps:[{},{},{},{}]},
  {date:'2026-09-03T20:00:00Z',result:'win',elo:1300,maps:[{}]},
  {date:'2026-09-04T11:00:00Z',result:'loss',elo:1250,maps:[{}]},
];
test('Ranked Play keeps per-match results and maps in chronological order',()=>{
  const day=rankedPlayForDay(matches,'2026-09-03');
  assert.deepEqual(day.results,['W','L','W']);
  assert.deepEqual(day.maps,[2,4,1]);
  assert.equal(day.previousElo,1200);
  assert.equal(day.elo,1300);
  assert.equal(day.eloDelta,100);
  assert.equal(day.matches.length,3);
});
test('Ranked Play does not leak matches into other dates',()=>{
  assert.equal(rankedPlayForDay(matches,'2026-09-05'),null);
  assert.deepEqual(rankedPlayForDay(matches,'2026-09-04').results,['L']);
});
