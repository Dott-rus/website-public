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
  return `<section class="day-section day-now"><h3>NOW</h3><div class="day-lines">${events.map((event) => `<div><time>${escapeHtml(timeOnly(event.at))}</time> ${Object.entries(event.changes).map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(value ?? 'cleared')}</span>`).join(' · ')}</div>`).join('')}</div></section>`;
}

function renderDigest(day, live = false) {
  const rows = [];
  if (day.gaming?.length) rows.push(`<div data-kind="gaming"><span class="day-key">PLAYED</span> ${day.gaming.map((x) => `${escapeHtml(x.title)}${x.minutes ? ` <small>${Math.round(x.minutes)}m</small>` : ''}`).join(', ')}</div>`);
  if (day.watching?.length) rows.push(`<div data-kind="watching"><span class="day-key">WATCHED</span> ${day.watching.map((x) => `${escapeHtml(x.title)}${x.episodes ? ` <small>${escapeHtml(String(x.episodes))} ep${Number(x.episodes) === 1 ? '' : 's'}</small>` : ''}`).join(', ')}</div>`);
  const streaks = day.music?.streaks || [];
  for (const streak of streaks) rows.push(`<div><span class="day-key">MUSIC</span> ${escapeHtml(streak.title)} <small>×${Number(streak.count) || 0}${streak.kind === 'album' ? ' tracks' : ''}</small></div>`);
  const plays = Number(day.music?.plays || 0);
  const musicQuiet = plays ? `<div class="day-quiet"><span class="day-key">LISTENED</span> ${plays} plays${day.music.tracks ? ` <small>· ${day.music.tracks} tracks</small>` : ''}${day.music.artists ? ` <small>· ${day.music.artists} artists</small>` : ''}</div>` : '';
  const commits = Number(day.code?.commits || 0);
  const code = commits ? `<div class="day-code"><span class="day-key">CODE</span> ${commits} commits <small>· Mira ${Number(day.code?.sources?.mira || 0)} · GitHub ${Number(day.code?.sources?.github || 0)}</small></div>` : '';
  const empty = !rows.length && !plays && !commits ? '<div class="day-quiet">Nothing recorded yet.</div>' : '';
  return `${live ? '<p class="day-live-note">[live] today is still being collected</p>' : ''}<section class="day-section"><h3>ACTIVITY</h3><div class="day-digest">${rows.join('')}${code}${musicQuiet}${empty}</div></section>${renderNow(day.now || [])}`;
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

function renderDayStrip(days, today) {
  const available = new Set(days.map((day)=>day.date));
  available.add(today);
  const dates = Array.from({length:14},(_,i)=>shiftDate(today,i-10));
  const current = dayMeta(today);
  return `<nav class="days-nav" aria-label="Day navigation"><div class="days-month"><span>${escapeHtml(current.monthLong)}</span><label class="days-jump">[jump]<input type="date" data-day-picker value="${today}"></label></div><div class="days-strip" data-days-strip>${dates.map((date)=>{const meta=dayMeta(date);const has=available.has(date);return `<a href="#day-${date}" data-day-link="${date}" class="${date===today?'is-today ':''}${has?'has-data':''}"><span>${meta.weekday}</span> ${meta.day}${date===today?'*':''}</a>`}).join(' ')}</div></nav>`;
}

function renderCompact(day, today) {
  const bits=[];
  if(day.gaming?.length) bits.push(`${day.gaming.length} game${day.gaming.length===1?'':'s'}`);
  if(day.watching?.length) bits.push(`${day.watching.length} watched`);
  if(Number(day.music?.plays||0)) bits.push(`${Number(day.music.plays)} plays`);
  if(Number(day.code?.commits||0)) bits.push(`${Number(day.code.commits)} commits`);
  return bits.length ? bits.join(' · ') : (day.date===today ? 'live' : 'quiet');
}

export function renderDays(days, nowDocument) {
  const today = localDateString();
  const existingToday = days.find((day) => day.date === today);
  const todayDay = existingToday || { date: today, gaming: [], watching: [], music: {}, code: {}, now: todayNowEvents(nowDocument, today) };
  if (existingToday && !existingToday.now?.length) existingToday.now = todayNowEvents(nowDocument, today);
  const ordered = [todayDay, ...days.filter((day) => day.date !== today)].sort((a,b)=>b.date.localeCompare(a.date));
  const list = ordered.map((day) => {
    const isToday = day.date === today;
    const meta = dayMeta(day.date);
    const note = day.note ? `<article class="day-note markdown-body">${day.note}</article>` : day.notePending ? '<div class="day-note-pending">✎ personal note unlocks after 14 days</div>' : '';
    return `<article class="day-entry ${isToday?'is-selected':''}" id="day-${day.date}" data-day-entry="${day.date}"><button class="day-entry-head" type="button" data-day-open="${day.date}"><span class="day-date">${escapeHtml(meta.day)} ${escapeHtml(meta.month)}</span><span class="day-title"><strong>${isToday?'TODAY':escapeHtml(meta.weekday)}</strong><small>${escapeHtml(renderCompact(day,today))}</small></span><span class="day-chevron" aria-hidden="true">[+]</span></button><div class="day-expanded"><div class="day-body" ${isToday?'data-live-day':''}>${renderDigest(day,isToday&&!day.bakedAt)}${note}</div></div></article>`;
  }).join('');
  return `${renderDayStrip(days,today)}<section class="days-list" data-days-list>${list}</section>`;
}
