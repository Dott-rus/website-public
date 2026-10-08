import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const USER = 18874372;
const POOL = 38;
const isoDate = (iso) => { const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)); const get = (type) => parts.find((p) => p.type === type)?.value; return `${get('year')}-${get('month')}-${get('day')}`; };

export function rankedPlayForDay(matches, date) {
  const sorted = [...matches].filter((m) => m?.date && Number.isFinite(Number(m.elo))).sort((a,b) => a.date.localeCompare(b.date));
  const today = sorted.filter((m) => isoDate(m.date) === date);
  if (!today.length) return null;
  const before = sorted.filter((m) => m.date < today[0].date);
  const previousElo = before.length ? Number(before.at(-1).elo) : null;
  const elo = Number(today.at(-1).elo);
  return {
    results: today.map((m) => m.result === 'win' ? 'W' : 'L'),
    maps: today.map((m) => m.maps?.length || null),
    elo, ...(previousElo === null ? {} : { previousElo, eloDelta: elo - previousElo }),
    matches: today.map((m) => ({ roomId: m.roomId, name: m.name, result: m.result, elo: m.elo, date: m.date, maps: m.maps || [] })),
  };
}

export async function collectRankedPlay(root, date) {
  const file = path.join(root, 'content', 'osu-ranked-play.json');
  const saved = JSON.parse(await readFile(file, 'utf8'));
  let matches = saved.matches || [];
  try {
    const response = await fetch(`https://osu.ppy.sh/matchmaking-pools/${POOL}/user-chart/${USER}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`osu! chart HTTP ${response.status}`);
    const chart = await response.json();
    const known = new Map(matches.map((m) => [String(m.id), m]));
    for (const entry of chart.user_elo_history || []) {
      const id = String(entry.id);
      const existing = known.get(id) || {};
      known.set(id, { ...existing, id: entry.id, date: entry.created_at, roomId: entry.room_id, result: entry.result, elo: entry.elo_after, maps: existing.maps || [] });
    }
    matches = [...known.values()].sort((a,b) => a.date.localeCompare(b.date));
    // Enrich new rooms only if an OAuth client is configured for the bake runner.
    if (process.env.OSU_CLIENT_ID && process.env.OSU_CLIENT_SECRET) {
      const tokenResponse = await fetch('https://osu.ppy.sh/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: Number(process.env.OSU_CLIENT_ID), client_secret: process.env.OSU_CLIENT_SECRET, grant_type: 'client_credentials', scope: 'public' }), signal: AbortSignal.timeout(12000) });
      if (!tokenResponse.ok) throw new Error(`osu! OAuth HTTP ${tokenResponse.status}`);
      const { access_token: token } = await tokenResponse.json();
      const get = async (url) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error(`osu! API HTTP ${r.status}`); return r.json(); };
      for (const match of matches.filter((m) => !m.name || !m.maps?.length)) {
        try {
          const base = `https://osu.ppy.sh/api/v2/rooms/${match.roomId}`;
          const room = await get(base);
          match.name = room.name;
          match.maps = [];
          for (const item of room.playlist || []) {
            const scores = await get(`${base}/playlist/${item.id}/scores`);
            match.maps.push({ beatmapId: item.beatmap_id, scores: (scores.scores || []).map((s) => ({ userId: s.user_id, username: s.user?.username, score: s.total_score, accuracy: s.accuracy, combo: s.max_combo, miss: s.statistics?.miss })) });
          }
        } catch (error) { console.warn(`Ranked Play room ${match.roomId}: ${error.message}`); }
      }
    }
    if (JSON.stringify(matches) !== JSON.stringify(saved.matches)) await writeFile(file, JSON.stringify({ pool: POOL, userId: USER, matches }, null, 2) + '\n');
  } catch (error) { console.warn(`Ranked Play refresh skipped: ${error.message}`); }
  return rankedPlayForDay(matches, date);
}
