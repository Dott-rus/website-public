import { readFile } from 'node:fs/promises';
import path from 'node:path';

const curatedTypes = new Set(['project', 'photo', 'note', 'life', 'site', 'collection']);
const typeDefinitions = Object.freeze({
  all: { label: 'Everything' },
  now: { label: 'Right now' },
  music: { label: 'Music' },
  project: { label: 'Projects' },
  photo: { label: 'Photos' },
  note: { label: 'Notes' },
  collection: { label: 'Collections' },
  life: { label: 'Life' },
  site: { label: 'Site' },
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function assertText(value, label, { max = 500 } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (Array.from(value).length > max) {
    throw new Error(`${label} must not exceed ${max} characters`);
  }
}

function assertDate(value, label) {
  assertText(value, label, { max: 40 });
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date`);
}

function assertHref(value, label) {
  if (value === undefined) return;
  assertText(value, label);
  if (!value.startsWith('/') && !/^https:\/\//i.test(value)) {
    throw new Error(`${label} must be a root-relative path or HTTPS URL`);
  }
}

export function validateFeedEntries(entries, source = 'content/feed.json') {
  if (!Array.isArray(entries)) throw new Error(`${source} must contain an array`);
  const ids = new Set();
  entries.forEach((entry, index) => {
    const label = `${source}[${index}]`;
    if (!isPlainObject(entry)) throw new Error(`${label} must be an object`);
    assertText(entry.id, `${label}.id`, { max: 80 });
    if (!/^[a-z0-9-]+$/.test(entry.id)) throw new Error(`${label}.id is not URL-safe`);
    if (ids.has(entry.id)) throw new Error(`${label}.id is duplicated`);
    ids.add(entry.id);
    if (!curatedTypes.has(entry.type)) throw new Error(`${label}.type is not supported`);
    assertDate(entry.date, `${label}.date`);
    assertText(entry.title, `${label}.title`, { max: 140 });
    assertText(entry.body, `${label}.body`);
    assertHref(entry.href, `${label}.href`);
    if (entry.href) assertText(entry.linkLabel, `${label}.linkLabel`, { max: 80 });
  });
  return entries;
}

export async function loadFeedEntries(projectRoot) {
  const filename = path.join(projectRoot, 'content', 'feed.json');
  let entries;
  try {
    entries = JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse content/feed.json: ${error.message}`);
  }
  return validateFeedEntries(entries);
}

export function addFeedEntry(entries, input, timestamp = new Date().toISOString()) {
  validateFeedEntries(entries);
  assertDate(timestamp, 'Feed update timestamp');

  const type = typeof input?.type === 'string' ? input.type.trim() : '';
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  const body = typeof input?.body === 'string' ? input.body.trim() : '';
  const href = typeof input?.href === 'string' ? input.href.trim() : '';
  const requestedId = typeof input?.id === 'string' ? input.id.trim() : '';
  const requestedDate = typeof input?.date === 'string' ? input.date.trim() : '';
  const requestedLabel = typeof input?.linkLabel === 'string'
    ? input.linkLabel.trim()
    : '';

  if (!curatedTypes.has(type)) {
    throw new Error(`FEED_TYPE must be one of: ${Array.from(curatedTypes).join(', ')}`);
  }
  assertText(title, 'FEED_TITLE', { max: 140 });
  assertText(body, 'FEED_BODY');

  const date = requestedDate || timestamp;
  assertDate(date, 'FEED_DATE');

  const existingIds = new Set(entries.map((entry) => entry.id));
  let id = requestedId;
  if (!id) {
    const stamp = new Date(timestamp).toISOString().replace(/\D/g, '').slice(0, 14);
    const baseId = `${type}-${stamp}`;
    id = baseId;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
  }

  const entry = { id, type, date, title, body };
  if (href) {
    entry.href = href;
    entry.linkLabel = requestedLabel || 'Open';
  }

  const nextEntries = [entry, ...entries];
  validateFeedEntries(nextEntries);
  return { entry, entries: nextEntries };
}

function timestampFor(value) {
  return new Date(value.length === 10 ? `${value}T12:00:00Z` : value).getTime();
}

function buildNowEntry(nowDocument) {
  if (!nowDocument.current.updatedAt) return [];
  const details = [
    nowDocument.current.doing && `Doing: ${nowDocument.current.doing}`,
    nowDocument.current.consuming && `Consuming: ${nowDocument.current.consuming}`,
    nowDocument.current.note && `Note: ${nowDocument.current.note}`,
  ].filter(Boolean);
  return [{
    id: 'current-now',
    type: 'now',
    date: nowDocument.current.updatedAt,
    title: 'Right now',
    body: details.join('\n'),
    href: '/now/',
    linkLabel: 'Open the NOW archive',
  }];
}

function buildTrackEntries(tracks) {
  return tracks.filter((track) => !track.draft && track.released).map((track) => ({
    id: `track-${track.slug}`,
    type: 'music',
    date: track.released,
    title: track.title,
    body: track.description,
    href: `/tracks/${track.slug}/`,
    linkLabel: 'Open track page',
    image: track.cover ? `/img/tracks/${track.cover}` : '',
    imageAlt: track.cover ? `${track.title} cover art` : '',
    eyebrow: track.artist,
  }));
}

export function composeFeed(entries, tracks, nowDocument) {
  validateFeedEntries(entries);
  return [
    ...entries,
    ...buildNowEntry(nowDocument),
    ...buildTrackEntries(tracks),
  ].sort((left, right) => timestampFor(right.date) - timestampFor(left.date));
}

function formatDate(value) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function renderEntry(entry) {
  const definition = typeDefinitions[entry.type];
  const external = /^https:\/\//i.test(entry.href || '');
  const linkAttributes = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  const image = entry.image
    ? `<img class="simple-feed-image" src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.imageAlt)}" width="80" height="80" loading="lazy">`
    : '';
  const eyebrow = entry.eyebrow
    ? `<span class="simple-feed-eyebrow">${escapeHtml(entry.eyebrow)}</span>`
    : '';
  const link = entry.href
    ? `<a class="link simple-feed-link" href="${escapeHtml(entry.href)}"${linkAttributes}>${escapeHtml(entry.linkLabel)}${external ? ' ↗' : ' →'}</a>`
    : '';

  return [
    `<li class="simple-feed-entry" data-feed-type="${escapeHtml(entry.type)}">`,
    '<article>',
    '<header class="simple-feed-meta">',
    `<time datetime="${escapeHtml(entry.date)}">${escapeHtml(formatDate(entry.date))}</time>`,
    ' · ',
    `<span>${escapeHtml(definition.label)}</span>`,
    '</header>',
    '<div class="simple-feed-content">',
    image,
    '<div class="simple-feed-copy">',
    eyebrow,
    `<h2>${escapeHtml(entry.title)}</h2>`,
    `<p>${escapeHtml(entry.body)}</p>`,
    link,
    '</div>',
    '</div>',
    '</article>',
    '</li>',
  ].join('');
}

export function renderFeed(entries) {
  return entries.map(renderEntry).join('');
}

export function renderFeedFilters(entries) {
  const counts = new Map();
  entries.forEach((entry) => counts.set(entry.type, (counts.get(entry.type) || 0) + 1));
  const buttons = ['all', ...Object.keys(typeDefinitions).filter((type) => type !== 'all' && counts.has(type))];
  return buttons.map((type) => {
    const definition = typeDefinitions[type];
    const count = type === 'all' ? entries.length : counts.get(type);
    const active = type === 'all' ? ' is-active' : '';
    const pressed = type === 'all' ? 'true' : 'false';
    return `<button class="simple-feed-filter${active}" type="button" data-feed-filter="${escapeHtml(type)}" aria-pressed="${pressed}">${escapeHtml(definition.label)} <small>${count}</small></button>`;
  }).join('');
}
