import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { parseYaml } from './content-yaml.mjs';
import { escapeHtml } from './content-utils.mjs';
import { localDateString } from './day-sources/time.mjs';

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MOSCOW = 'Europe/Moscow';


function dayNumber(value) {
  const [y, m, d] = value.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function parseDayNote(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { content: source, publishNow: false };

  const meta = parseYaml(match[1], 'day note frontmatter');
  return {
    content: source.slice(match[0].length),
    publishNow: meta?.publish === 'now',
  };
}

function noteIsPublic(date, publishNow = false, today = localDateString()) {
  return publishNow || dayNumber(today) - dayNumber(date) >= 14;
}

function validateDay(day, source) {
  if (!day || typeof day !== 'object' || Array.isArray(day)) throw new Error(`${source} must contain an object`);
  if (!DATE_RE.test(day.date || '')) throw new Error(`${source}.date must use YYYY-MM-DD`);
  if (day.bakedAt && Number.isNaN(Date.parse(day.bakedAt))) throw new Error(`${source}.bakedAt must be an ISO timestamp`);
  day.music ||= {};
  day.code ||= {};
  day.gaming ||= [];
  day.watching ||= [];
  day.podcasts ||= [];
  day.now ||= [];
  return day;
}

export async function loadDays(projectRoot) {
  const directory = path.join(projectRoot, 'content', 'days');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.yaml')).sort().reverse();
  const days = [];
  for (const name of names) {
    const source = path.join('content', 'days', name);
    const day = validateDay(parseYaml(await readFile(path.join(directory, name), 'utf8'), source), source);
    const notePath = path.join(projectRoot, 'content', 'day-notes', `${day.date}.md`);
    try {
      const note = parseDayNote(await readFile(notePath, 'utf8'));
      const isPublic = noteIsPublic(day.date, note.publishNow);
      day.note = isPublic ? md.render(note.content) : null;
      day.notePending = !isPublic;
    } catch {
      day.note = null;
      day.notePending = false;
    }
    days.push(day);
  }
  return days;
}

function todayNowEvents(nowDocument, today) {
  return nowDocument.history
    .filter((entry) => localDateString(new Date(entry.at)) === today)
    .slice()
    .reverse()
    .map((entry) => ({ at: entry.at, changes: entry.changes }));
}

function timeOnly(value) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: MOSCOW, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

function renderNow(events) {
  if (!events.length) return '';
  return `<section class="day-section day-now"><h3 class="day-section-title">NOW</h3><div class="day-lines">${events.map((event) => `<div><time>${escapeHtml(timeOnly(event.at))}</time> ${Object.entries(event.changes).map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(value ?? 'cleared')}</span>`).join(' · ')}</div>`).join('')}</div></section>`;
}

function mediaCover(item = {}) {
  return item.cover || item.image || item.poster || item.thumbnail || item.artwork || item.coverUrl || item.imageUrl || item.posterUrl || '';
}

function watchedMeta(item = {}) {
  const watched = Array.isArray(item.watched) ? item.watched : [];
  if (!watched.length) return item.episodes ? `${item.episodes} ep${Number(item.episodes) === 1 ? '' : 's'}` : '';
  const seasons = new Map();
  for (const entry of watched) {
    const season = Number(entry?.season);
    const episode = Number(entry?.episode);
    if (!Number.isFinite(season) || !Number.isFinite(episode)) continue;
    if (!seasons.has(season)) seasons.set(season, []);
    seasons.get(season).push(episode);
  }
  const ranges = (values) => {
    const nums = [...new Set(values)].sort((a,b)=>a-b);
    const parts = [];
    for (let i=0;i<nums.length;) {
      let j=i; while (j+1<nums.length && nums[j+1]===nums[j]+1) j++;
      parts.push(i===j ? `E${nums[i]}` : `E${nums[i]}–E${nums[j]}`);
      i=j+1;
    }
    return parts.join(', ');
  };
  const detail = [...seasons.entries()].sort((a,b)=>a[0]-b[0]).map(([season, episodes])=>`S${season} · ${ranges(episodes)}`).join(' / ');
  return detail || (item.episodes ? `${item.episodes} ep${Number(item.episodes) === 1 ? '' : 's'}` : '');
}

function renderMediaItem(item = {}, meta = '', subtitle = '', kind = 'music') {
  const cover = mediaCover(item);
  const progress = kind === 'podcast' && Number(item.total) > 0 ? Math.min(100, Math.max(0, Math.round(Number(item.position || 0) / Number(item.total) * 100))) : null;
  return `<span class="day-media-item day-media-${kind}">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}<span class="day-media-copy"><span>${escapeHtml(item.title || '?')}</span>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}${meta ? `<small>${escapeHtml(meta)}</small>` : ''}${progress !== null ? `<span class=\"day-podcast-progress\" aria-hidden=\"true\"><i style=\"width:${progress}%\"></i></span>` : ''}</span></span>`;
}

function podcastMeta(item = {}) {
  const bits = [];
  const minutes = Number(item.minutes || 0);
  const position = Number(item.position || 0);
  const total = Number(item.total || 0);
  if (minutes > 0) bits.push(`${Math.round(minutes)}m`);
  if (item.finished) bits.push('finished');
  else if (total > 0 && position >= 0) bits.push(`${Math.min(100, Math.max(0, Math.round(position / total * 100)))}%`);
  return bits.join(' · ');
}

function renderRankedPlay(rp = {}) {
  const results = (rp.results || []).join(' ');
  const maps = (rp.maps || []).map(n => n ?? '?').join(' ');
  const elo = Number(rp.elo);
  const delta = Number(rp.eloDelta);
  const rating = rp.previousElo === undefined ? `${elo.toLocaleString('en-US')}` : `${Number(rp.previousElo).toLocaleString('en-US')} → ${elo.toLocaleString('en-US')} ${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}${Math.abs(delta).toLocaleString('en-US')}`;
  const stat = (name,value) => `<span class="day-game-stat"><small>${name}</small><b>${escapeHtml(value)}</b></span>`;
  const matches = (rp.matches || []).map(match => `<details class="day-rp-match"><summary>${escapeHtml(match.result === 'win' ? 'W' : 'L')} · ${escapeHtml(match.name || `Room ${match.roomId}`)} · ${escapeHtml(match.elo)} Elo</summary>${(match.maps || []).map(map => { const b = map.beatmap || {}; return `<span class="day-rp-map"><a href="https://osu.ppy.sh/beatmaps/${encodeURIComponent(map.beatmapId)}" target="_blank" rel="noopener noreferrer">${escapeHtml([b.artist,b.title].filter(Boolean).join(' — ') || `Beatmap ${map.beatmapId}`)}${b.version ? ` [${escapeHtml(b.version)}]` : ''}</a>${(map.scores || []).map(score => `<span class="day-rp-score${score.userId === 18874372 ? ' day-rp-me' : ''}">${escapeHtml(score.username || score.userId)}: ${Number(score.score || 0).toLocaleString('en-US')} · ${(Number(score.accuracy || 0)*100).toFixed(2)}% · ${Number(score.combo || 0)}×</span>`).join('')}</span>`; }).join('')}</details>`).join('');
  return `<span class="day-game-section"><span class="day-game-section-label">RANKED PLAY</span><span class="day-game-stat-grid">${stat('Result',results)}${stat('Elo',rating)}${stat('Maps',maps)}</span>${matches ? `<details class="day-rp-history"><summary>Match details · map scores</summary>${matches}</details>` : ''}</span>`;
}

function renderGameItem(item = {}) {
    const hasInsights = item.supported === true || Number(item.plays || 0) > 0 || (item.insights && typeof item.insights === 'object');
    if (!hasInsights) {
    const achievements = Number(item.achievements || item.achievementsUnlocked || 0);
    const meta = [item.minutes ? `${Math.round(item.minutes)}m` : '', achievements ? `+${achievements} ach` : ''].filter(Boolean).join(' · ');
    return renderMediaItem(item, meta, '', 'game');
    }

  const cover = mediaCover(item);
    const title = item.title || '?';
    const summary = [item.minutes ? `${Math.round(item.minutes)}m` : '', Number(item.plays || 0) > 0 ? `${Number(item.plays)} plays` : ''].filter(Boolean).join(' · ');
    if (title === 'osu!') {
      const insights = item.insights && typeof item.insights === 'object' ? item.insights : {};
      const standardOrder = ['global rank', 'pp', 'best', 'PBs'];
      const standard = standardOrder.filter((label) => insights[label] !== null && insights[label] !== undefined && insights[label] !== '').map((label) => `<span class="day-game-stat"><small>${escapeHtml(label)}</small><b>${escapeHtml(insights[label])}</b></span>`).join('');
      const ranked = item.rankedPlay && typeof item.rankedPlay === 'object' ? Object.entries(item.rankedPlay).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => `<span class="day-game-stat"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('') : '';
      return `<span class="day-game-insight day-game-osu">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}<span class="day-game-insight-body"><span class="day-game-title-row"><strong>${escapeHtml(title)}</strong>${summary ? `<small>${escapeHtml(summary)}</small>` : ''}</span><span class="day-game-section"><span class="day-game-section-label">STANDARD</span><span class="day-game-stat-grid">${standard || '<small class="day-game-muted">collecting telemetry</small>'}</span></span>${item.rankedPlay?.results ? renderRankedPlay(item.rankedPlay) : ranked ? `<span class=\"day-game-section\"><span class=\"day-game-section-label\">RANKED PLAY</span><span class=\"day-game-stat-grid\">${ranked}</span></span>` : ''}</span></span>`;
    }

    if (item.provider === 'lichess' && Array.isArray(item.matches)) {
      const insights = item.insights && typeof item.insights === 'object' ? item.insights : {};
      const stats = Object.entries(insights).map(([label, value]) => `<span class="day-game-stat"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join('');
      const matches = item.matches.map((match, index) => {
        const id = String(match.id || '');
        const url = /^\w{8}$/.test(id) ? `https://lichess.org/${id}` : '';
        const result = ({win:'W', loss:'L', draw:'D'})[match.result] || '?';
        const delta = Number.isFinite(match.ratingDiff) ? ` · ${match.ratingDiff >= 0 ? '+' : ''}${match.ratingDiff}` : '';
        const meta = [match.color, match.speed, match.rated ? `rated${delta}` : 'casual', `vs ${match.opponent || 'Guest'}`].filter(Boolean).join(' · ');
        return `<span class="day-game-stat"><small>${index + 1} · ${escapeHtml(result)} · ${escapeHtml(meta)}</small><b>${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(id)} ↗</a>` : escapeHtml(id)}</b></span>`;
      }).join('');
      return `<span class="day-game-insight day-game-lichess"><span class="day-game-chess-cover" aria-hidden="true">♞</span><span class="day-game-insight-body"><span class="day-game-title-row"><strong>Lichess</strong><small>${[item.minutes ? `${Math.round(item.minutes)}m` : '', `${item.plays || item.matches.length} games`].filter(Boolean).join(' · ')}</small></span><span class="day-game-section"><span class="day-game-section-label">SUMMARY</span><span class="day-game-stat-grid">${stats}</span></span><span class="day-game-section"><span class="day-game-section-label">GAMES</span><span class="day-game-stat-grid">${matches}</span></span></span></span>`;
    }

    const stats = [];
    if (item.minutes) stats.push(`${Math.round(item.minutes)}m played`);
    if (Number(item.plays || 0) > 0) stats.push(`${Number(item.plays)} plays`);
    if (item.insights && typeof item.insights === 'object') {
      for (const [label, value] of Object.entries(item.insights)) {
        if (value !== null && value !== undefined && value !== '') stats.push(`${label}: ${value}`);
      }
    }
    return `<span class="day-game-insight">${cover ? `<img src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async">` : ''}<span class="day-game-insight-body"><strong>${escapeHtml(title)}</strong><span class="day-game-insight-stats">${stats.map((stat) => `<small>${escapeHtml(stat)}</small>`).join('')}</span></span></span>`;
  }

function renderDigest(day, live = false) {
  const rows = [];

  if (day.gaming?.length) {
    const supported = day.gaming.filter((item) => item.supported === true || Number(item.plays || 0) > 0 || (item.insights && typeof item.insights === 'object'));
    const generic = day.gaming.filter((item) => !supported.includes(item));
    const games = `${supported.length ? `<span class="day-game-supported-grid">${supported.map(renderGameItem).join('')}</span>` : ''}${generic.length ? `<span class="day-game-generic-grid">${generic.map(renderGameItem).join('')}</span>` : ''}`;
    rows.push(`<fieldset data-kind="gaming" class="day-media-row day-media-section day-media-section-games"><legend>Played</legend><span class="day-media-items day-game-groups">${games}</span></fieldset>`);
  }

  if (day.watching?.length) rows.push(`<fieldset data-kind="watching" class="day-media-row day-media-section day-media-section-watch"><legend>Watched</legend><span class="day-media-items">${day.watching.map((x) => renderMediaItem(x, watchedMeta(x), '', 'poster')).join('')}</span></fieldset>`);
  if (day.podcasts?.length) rows.push(`<fieldset data-kind="podcasts" class="day-media-row day-media-section day-media-section-podcasts"><legend>Podcasts</legend><span class="day-media-items">${day.podcasts.map((x) => renderMediaItem(x, podcastMeta(x), x.podcast || '', 'podcast')).join('')}</span></fieldset>`);
  const streaks = day.music?.streaks || [];
  for (const streak of streaks) rows.push(`<fieldset class="day-media-row day-music"><legend>On repeat</legend><span class="day-media-items">${renderMediaItem(streak, `${Number(streak.count) || 0} times${streak.kind === 'album' ? ' tracks' : ''}`, streak.artist)}</span></fieldset>`);
  const plays = Number(day.music?.plays || 0);
  const musicQuiet = plays ? `<fieldset class="day-quiet"><legend>Listened</legend> ${plays} plays${day.music.tracks ? ` <small>· ${day.music.tracks} tracks</small>` : ''}${day.music.artists ? ` <small>· ${day.music.artists} artists</small>` : ''}</fieldset>` : '';
  const commits = Number(day.code?.commits || 0);
  const code = commits ? `<fieldset class="day-code"><legend>Code</legend> ${commits} commit${commits === 1 ? '' : 's'} <small>· Mira ${Number(day.code?.sources?.mira || 0)} · GitHub ${Number(day.code?.sources?.github || 0)}</small></fieldset>` : '';
  const empty = !rows.length && !plays && !commits ? '<div class="day-empty"><span aria-hidden="true">· · ·</span><p>Nothing recorded yet.</p><small></small></div>' : '';
  return `${live ? '<p class="day-live-note">[live] collecting today</p>' : ''}<section class="day-section"><div class="day-digest">${rows.join('')}${code}${musicQuiet}${empty}</div></section>${renderNow(day.now || [])}`;
}

function shiftDate(date, delta) {
  const [y,m,d] = date.split('-').map(Number);
  const value = new Date(Date.UTC(y,m-1,d+delta));
  return value.toISOString().slice(0,10);
}

function dayMeta(date) {
  const value = new Date(`${date}T12:00:00Z`);
  return {
    day: new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'2-digit'}).format(value),
    weekday: new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'short'}).format(value).toUpperCase(),
    month: new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',month:'short'}).format(value).toUpperCase(),
    monthLong: new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',month:'long',year:'numeric'}).format(value),
  };
}

function renderArchive(days, today) {
  const months = [...new Set(days.map(day => day.date.slice(0, 7)))];
  const links = days.map(day => {
    const meta = dayMeta(day.date);
    const isToday = day.date === today;
    const titles = [...(day.gaming || []), ...(day.watching || []), ...(day.podcasts || [])].map(item => item.title).filter(Boolean);
    const subtitle = titles.slice(0, 2).join(' / ') || renderCompact(day, today);
    return `<a class="days-index-row ${isToday ? 'is-selected' : ''}" href="#day-${day.date}" data-day-link="${day.date}" ${isToday ? 'aria-current="date"' : ''}><span class="days-index-number">${meta.day}</span><span class="days-index-copy"><strong>${isToday ? 'Today' : meta.weekday}<span>${day.note ? '✎' : ''}</span></strong><small>${escapeHtml(subtitle)}</small></span></a>`;
  }).join('');
  return `<details class="days-archive" data-days-archive open><summary>─ Days ─ <span aria-hidden="true">↗</span></summary><div class="days-archive-inner"><label class="days-month-label" for="days-month">ARCHIVE</label><select id="days-month" data-days-month>${months.map(month => `<option value="${month}">${escapeHtml(dayMeta(month + '-01').monthLong)}</option>`).join('')}</select><nav class="days-index" aria-label="Choose a day">${links}</nav><label class="days-date-label">Jump to date<input type="date" data-day-picker value="${today}" max="${today}" min="${days[days.length - 1]?.date || today}"></label><p class="days-feedback" data-days-feedback role="status"></p></div></details>`;
}

function renderCompact(day, today) {
  const bits=[];
  if(day.gaming?.length) bits.push(`${day.gaming.length} game${day.gaming.length===1?'':'s'}`);
  if(day.watching?.length) bits.push(`${day.watching.length} watched`);
  if(day.podcasts?.length) bits.push(`${day.podcasts.length} podcast${day.podcasts.length===1?'':'s'}`);
  if(Number(day.music?.plays||0)) bits.push(`${Number(day.music.plays)} listens`);
  if(Number(day.code?.commits||0)) bits.push(`${Number(day.code.commits)} commit${Number(day.code.commits) === 1 ? '' : 's'}`);
  return bits.length ? bits.join(' · ') : (day.date===today ? 'live' : 'quiet');
}


function demoDays(today) {
  const d = (delta) => shiftDate(today, delta);
  return [
    {
      date: today,
      gaming: [
        { title: 'osu!', minutes: 102, plays: 46, cover: '/img/tracks/oktidk.png' },
        { title: 'Portal 2', minutes: 47, cover: '/img/tracks/snowing-somewhere.jpg' },
      ],
      watching: [
        { title: 'Jet Lag: The Game', episodes: 3, watched: [{ season: 4, episode: 4 }, { season: 4, episode: 5 }, { season: 4, episode: 6 }], poster: '/img/tracks/silent-illusions.jpg' },
        { title: 'Serial Experiments Lain — deliberately very long title for layout testing', episodes: 2, watched: [{ season: 1, episode: 4 }, { season: 1, episode: 6 }], image: '/img/tracks/oh-i-knew.jpg' },
      ],
      music: {
        plays: 83,
        tracks: 61,
        artists: 38,
        streaks: [
          { kind: 'track', title: 'Resonance', artist: 'HOME', count: 5, cover: '/img/tracks/snowing-somewhere.jpg' },
        ],
      },
      code: { commits: 7, sources: { mira: 5, github: 2 } },
      now: [
        { at: `${today}T00:42:00+03:00`, changes: { status: 'watching Jet Lag' } },
        { at: `${today}T01:08:00+03:00`, changes: { status: 'messing with Days CSS', device: 'dotlap' } },
      ],
    },
    {
      date: d(-1),
      bakedAt: `${d(-1)}T21:00:00.000Z`,

      gaming: [
        { title: 'osu!', minutes: 184, plays: 137, cover: '/img/tracks/oktidk.png', insights: { 'global rank': '#183,742 → #183,391 ↑351', pp: '+31.70', best: '146pp · 98.42% · Flamewall [Nymphe\'s HARD]', PBs: 2 }, rankedPlay: { matches: '12 · 8W 4L', rating: '1,427 → 1,486 ↑59', division: 'Gold II', streak: 'W3' } },
        { title: 'Geometry Dash', minutes: 96, cover: '/img/tracks/silent-illusions.jpg', supported: true, insights: { attempts: 284, stars: '+17', demons: '+1', PB: '43% → 58%' } },
        { title: 'Factorio', minutes: 221, cover: '/img/tracks/snowing-somewhere.jpg', supported: true, insights: { science: '18.4k', built: '1,247 entities', rockets: 3 } },
        { title: 'Portal 2', minutes: 73, achievements: 2, cover: '/img/tracks/oh-i-knew.jpg' },
        { title: 'ULTRAKILL', minutes: 51, cover: '/img/tracks/silent-illusions.jpg' },
        { title: 'Terraria', minutes: 38, achievements: 5, cover: '/img/tracks/snowing-somewhere.jpg' },
        { title: 'Rhythm Doctor', minutes: 27, cover: '/img/tracks/oktidk.png' },
      ],
      watching: [
        { title: 'Arcane', episodes: 4, watched: [{ season: 1, episode: 5 }, { season: 1, episode: 6 }, { season: 1, episode: 7 }, { season: 1, episode: 8 }], thumbnail: '/img/tracks/silent-illusions.jpg' },
        { title: 'Serial Experiments Lain', episodes: 3, watched: [{ season: 1, episode: 4 }, { season: 1, episode: 5 }, { season: 1, episode: 6 }], poster: '/img/tracks/oh-i-knew.jpg' },
        { title: 'Jet Lag: The Game', episodes: 2, watched: [{ season: 4, episode: 7 }, { season: 4, episode: 8 }], poster: '/img/tracks/snowing-somewhere.jpg' },
        { title: 'A movie with an annoyingly long title to stress the card wrapping properly', episodes: 1, poster: '/img/tracks/oktidk.png' },
      ],
      music: {
        plays: 347,
        tracks: 219,
        artists: 94,
        streaks: [
          { kind: 'track', title: 'Resonance', artist: 'HOME', count: 11, cover: '/img/tracks/snowing-somewhere.jpg' },
          { kind: 'track', title: 'Pixel Galaxy', artist: "Snail's House", count: 8, cover: '/img/tracks/oktidk.png' },
          { kind: 'track', title: 'Oh I Knew', artist: 'placeholder artist', count: 6, cover: '/img/tracks/oh-i-knew.jpg' },
        ],
      },
      code: { commits: 42, sources: { mira: 34, github: 8 } },
      now: [
        { at: `${d(-1)}T09:12:00+03:00`, changes: { status: 'playing osu!', device: 'dotlap' } },
        { at: `${d(-1)}T12:48:00+03:00`, changes: { status: 'breaking Geometry Dash again' } },
        { at: `${d(-1)}T16:03:00+03:00`, changes: { status: 'building an unreasonable Factorio bus', device: 'dotlap' } },
        { at: `${d(-1)}T21:37:00+03:00`, changes: { status: 'watching Arcane' } },
      ],
      note: '<p>Deliberately overloaded dev fixture: lots of games, supported integrations, watched media, music and commits in one day.</p><p>If this day still reads cleanly, the layout is probably not going to explode on a real busy day.</p>',

    },
    {
      date: d(-2),
      bakedAt: `${d(-2)}T21:00:00.000Z`,
      gaming: [],
      watching: [],
      music: { plays: 11, tracks: 10, artists: 7, streaks: [] },
      code: { commits: 0, sources: { mira: 0, github: 0 } },
      now: [],
      notePending: true,
    },
    {
      date: d(-3),
      bakedAt: `${d(-3)}T21:00:00.000Z`,
      gaming: [], watching: [], music: {}, code: {}, now: [],
    },
  ];
}

export function renderDays(days, nowDocument, { demo = false } = {}) {
  const today = localDateString();
  if (demo) days = demoDays(today);
  const existingToday = days.find(day => day.date === today);
  const todayDay = existingToday || { date: today, gaming: [], watching: [], podcasts: [], music: {}, code: {}, now: todayNowEvents(nowDocument, today) };
  if (existingToday && !existingToday.now?.length) existingToday.now = todayNowEvents(nowDocument, today);
  const ordered = [todayDay, ...days.filter(day => day.date !== today)].sort((a, b) => b.date.localeCompare(a.date));
  const articles = ordered.map(day => {
    const isToday = day.date === today;
    const date = new Date(day.date + 'T12:00:00Z');
    const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(date);
    const dateTitle = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
    const note = day.note ? `<section class="day-note markdown-body" aria-label="Personal note">${day.note}</section>` : '';
    const pending = day.notePending ? '<p class="day-note-pending">✎ A personal note will appear here after 14 days.</p>' : '';
    return `<article class="day-entry ${isToday ? 'is-selected' : ''}" id="day-${day.date}" data-day-entry="${day.date}" aria-labelledby="title-${day.date}" ${isToday ? '' : 'hidden'}><header class="day-heading"><div class="day-kicker"><span data-day-weekday>${isToday ? 'Today' : weekday}</span><span class="day-state ${isToday ? 'is-live' : ''}" data-day-state>${isToday ? '● LIVE' : day.date.slice(0, 4)}</span></div><h2 id="title-${day.date}" tabindex="-1"><time datetime="${day.date}">${dateTitle}</time></h2><p class="day-overview" data-day-overview>${escapeHtml(renderCompact(day, today))}</p></header><div class="day-body" ${isToday ? 'data-live-day' : ''}>${renderHighlights(day.highlights)}${note}${renderDigest(day, isToday && !day.bakedAt)}${pending}</div></article>`;
  }).join('');
  return `<div class="days-workspace"><div class="days-reader"><nav class="days-reader-nav" aria-label="Adjacent days"><button type="button" data-day-step="1">← Older day</button><button type="button" data-days-today>Today</button><button type="button" data-day-step="-1">Newer day →</button></nav><section class="days-list" data-days-list>${articles}</section></div></div>`;
}

export function renderDaysArchive(days, { demo = false } = {}) {
  const today = localDateString();
  if (demo) days = demoDays(today);
  const ordered = [...days];
  if (!ordered.some(day => day.date === today)) ordered.push({ date: today });
  return renderArchive(ordered.sort((a,b)=>b.date.localeCompare(a.date)), today);
}

export function renderHighlights(items) {
  if (!Array.isArray(items)) return '';
  const valid = items.filter(item => item && typeof item.title === 'string' && item.title.trim());
  if (!valid.length) return '';
  const safeUrl = value => typeof value === 'string' && /^https?:\/\//i.test(value) ? escapeHtml(value) : '';
  return `<fieldset class="day-highlights" aria-label="Highlights of the day"><legend>Highlights</legend><div class="day-highlights-grid">${valid.map(item => {
    const href = safeUrl(item.url);
    const cover = safeUrl(item.cover);
    const title = href ? `<a href="${href}" rel="noopener noreferrer">${escapeHtml(item.title)}</a>` : escapeHtml(item.title);
    return `<article class="day-highlight ${/^(track|album|music)$/i.test(item.type || '') ? 'day-highlight-music' : ''}">${cover ? `<img src="${cover}" alt="" loading="lazy">` : ''}<div><small>${escapeHtml(item.type || 'highlight')}</small><strong>${title}</strong>${item.artist ? `<span>${escapeHtml(item.artist)}</span>` : ''}${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}</div></article>`;
  }).join('')}</div></fieldset>`;
}
