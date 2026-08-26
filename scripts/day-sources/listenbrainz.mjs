import { dayBounds } from './time.mjs';

const API = 'https://api.listenbrainz.org/1';
const USER = process.env.LISTENBRAINZ_USER || 'somedott';

async function page(date, maxTs) {
  const { minTs } = dayBounds(date);
  const url = new URL(`${API}/user/${encodeURIComponent(USER)}/listens`);
  url.searchParams.set('min_ts', String(minTs));
  url.searchParams.set('max_ts', String(maxTs));
  url.searchParams.set('count', '1000');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ListenBrainz returned ${response.status}`);
  return (await response.json())?.payload?.listens || [];
}

function streaks(listens) {
  const rows = listens.slice().sort((a,b)=>a.listened_at-b.listened_at).map((listen) => {
    const m = listen.track_metadata || {};
    return { track: m.track_name || '', artist: m.artist_name || '', album: m.release_name || '' };
  });
  const result = [];
  for (const kind of ['track','album']) {
    let start = 0;
    const key = (x) => kind === 'track' ? `${x.artist}\n${x.track}` : x.album;
    for (let i=1; i<=rows.length; i++) {
      if (i < rows.length && key(rows[i]) && key(rows[i]) === key(rows[start])) continue;
      const count = i - start;
      const threshold = kind === 'track' ? 3 : 4;
      if (rows[start] && key(rows[start]) && count >= threshold) {
        result.push({ kind, title: kind === 'track' ? rows[start].track : rows[start].album, count });
      }
      start = i;
    }
  }
  return result.sort((a,b)=>b.count-a.count);
}

export async function collectMusic(date) {
  const { maxTs } = dayBounds(date);
  const listens = [];
  let cursor = maxTs;
  for (;;) {
    const chunk = await page(date, cursor);
    if (!chunk.length) break;
    listens.push(...chunk);
    if (chunk.length < 1000) break;
    const oldest = Math.min(...chunk.map((x)=>Number(x.listened_at)||cursor));
    if (oldest >= cursor) break;
    cursor = oldest - 1;
  }
  const unique = new Map(listens.map((x)=>[`${x.listened_at}:${x.track_metadata?.artist_name}:${x.track_metadata?.track_name}`,x]));
  const rows = [...unique.values()];
  const tracks = new Set(), artists = new Set();
  for (const x of rows) {
    const m=x.track_metadata||{};
    if (m.track_name || m.artist_name) tracks.add(`${m.artist_name||''}\n${m.track_name||''}`);
    if (m.artist_name) artists.add(m.artist_name);
  }
  return { plays: rows.length, tracks: tracks.size, artists: artists.size, streaks: streaks(rows) };
}
