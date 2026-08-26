import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { parseYaml } from './content-yaml.mjs';
import { escapeHtml } from './content-utils.mjs';

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MOSCOW = 'Europe/Moscow';

function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MOSCOW, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function dayNumber(value) {
  const [y, m, d] = value.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function noteIsPublic(date, today = localDateString()) {
  return dayNumber(today) - dayNumber(date) >= 14;
}

function validateDay(day, source) {
  if (!day || typeof day !== 'object' || Array.isArray(day)) throw new Error(`${source} must contain an object`);
  if (!DATE_RE.test(day.date || '')) throw new Error(`${source}.date must use YYYY-MM-DD`);
  if (day.bakedAt && Number.isNaN(Date.parse(day.bakedAt))) throw new Error(`${source}.bakedAt must be an ISO timestamp`);
  day.music ||= {};
  day.code ||= {};
  day.gaming ||= [];
  day.watching ||= [];
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
      const note = await readFile(notePath, 'utf8');
      day.note = noteIsPublic(day.date) ? md.render(note) : null;
      day.notePending = !noteIsPublic(day.date);
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
  return `<div class="day-now"><strong>NOW</strong>${events.map((event) => `<div><time>${escapeHtml(timeOnly(event.at))}</time> ${Object.entries(event.changes).map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(value ?? 'cleared')}</span>`).join(' · ')}</div>`).join('')}</div>`;
}

function renderDigest(day, live = false) {
  const rows = [];
  if (day.gaming?.length) rows.push(`🎮 ${day.gaming.map((x) => `${escapeHtml(x.title)}${x.minutes ? ` · ${Math.round(x.minutes)}m` : ''}`).join(', ')}`);
  if (day.watching?.length) rows.push(`📺 ${day.watching.map((x) => `${escapeHtml(x.title)}${x.episodes ? ` · ${escapeHtml(String(x.episodes))}` : ''}`).join(', ')}`);
  const streaks = day.music?.streaks || [];
  for (const streak of streaks) rows.push(`♫ ${escapeHtml(streak.title)} ×${Number(streak.count) || 0}${streak.kind === 'album' ? ' tracks' : ''}`);
  const plays = Number(day.music?.plays || 0);
  const musicQuiet = plays ? `<div class="day-quiet">${plays} plays${day.music.tracks ? ` · ${day.music.tracks} tracks` : ''}${day.music.artists ? ` · ${day.music.artists} artists` : ''}</div>` : '';
  const commits = Number(day.code?.commits || 0);
  const code = commits ? `<div class="day-code">⌘ Code · ${commits} commits <small>Mira ${Number(day.code?.sources?.mira || 0)} · GitHub ${Number(day.code?.sources?.github || 0)}</small></div>` : '';
  return `${live ? '<div class="day-live-note">Live data may be unavailable or incomplete.</div>' : ''}<div class="day-digest">${rows.map((row) => `<div>${row}</div>`).join('')}${code}${musicQuiet}</div>${renderNow(day.now || [])}`;
}

function dateLabel(date, today) {
  if (date === today) return 'TODAY';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00Z`)).toUpperCase();
}

function renderCalendar(days, today) {
  const active = new Set(days.map((day) => day.date));
  active.add(today);
  const [year, month] = today.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: offset }, () => '<span></span>');
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const cls = [active.has(date) ? 'has-data' : '', date === today ? 'is-today' : ''].filter(Boolean).join(' ');
    cells.push(`<a href="#day-${date}" class="${cls}">${d}</a>`);
  }
  const title = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(first);
  return `<section class="days-calendar"><h2>${escapeHtml(title)}</h2><div class="days-weekdays"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div><div class="days-grid">${cells.join('')}</div></section>`;
}

export function renderDays(days, nowDocument) {
  const today = localDateString();
  const existingToday = days.find((day) => day.date === today);
  const todayDay = existingToday || { date: today, gaming: [], watching: [], music: {}, code: {}, now: todayNowEvents(nowDocument, today) };
  if (existingToday && !existingToday.now?.length) existingToday.now = todayNowEvents(nowDocument, today);
  const ordered = [todayDay, ...days.filter((day) => day.date !== today)].sort((a, b) => b.date.localeCompare(a.date));
  const list = ordered.map((day) => {
    const isToday = day.date === today;
    const note = day.note ? `<article class="day-note markdown-body">${day.note}</article>` : day.notePending ? '<div class="day-note-pending">✎ note available after 14 days</div>' : '';
    return `<details class="day-card" id="day-${day.date}" ${isToday ? 'open' : ''}><summary><strong>${escapeHtml(dateLabel(day.date, today))}</strong><span>${escapeHtml(day.date)}</span></summary><div class="day-body" ${isToday ? 'data-live-day' : ''}>${renderDigest(day, isToday && !day.bakedAt)}${note}</div></details>`;
  }).join('');
  return `${renderCalendar(days, today)}<section class="days-list">${list}</section>`;
}
