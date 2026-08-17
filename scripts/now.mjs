import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const nowHistoryLimit = 500;

export const nowFields = Object.freeze({
  doing: { label: 'Doing', maxLength: 120 },
  consuming: { label: 'Consuming', maxLength: 120 },
  note: { label: 'Note', maxLength: 280 },
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertTimestamp(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid ISO timestamp${nullable ? ' or null' : ''}`);
  }
}

function assertFieldValue(field, value, label, { nullable = true } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string${nullable ? ' or null' : ''}`);
  }

  const length = Array.from(value).length;
  const limit = nowFields[field].maxLength;
  if (!value.trim()) throw new Error(`${label} must not be blank`);
  if (length > limit) throw new Error(`${label} is ${length} characters; maximum is ${limit}`);
}

export function validateNowDocument(document, source = 'content/now.json') {
  if (!isPlainObject(document)) throw new Error(`${source} must contain an object`);
  if (!isPlainObject(document.current)) throw new Error(`${source}.current must be an object`);

  for (const field of Object.keys(nowFields)) {
    assertFieldValue(field, document.current[field], `${source}.current.${field}`);
  }
  assertTimestamp(document.current.updatedAt, `${source}.current.updatedAt`, { nullable: true });

  if (!Array.isArray(document.history)) throw new Error(`${source}.history must be an array`);
  if (document.history.length > nowHistoryLimit) {
    throw new Error(`${source}.history contains more than ${nowHistoryLimit} entries`);
  }

  document.history.forEach((entry, index) => {
    const label = `${source}.history[${index}]`;
    if (!isPlainObject(entry)) throw new Error(`${label} must be an object`);
    assertTimestamp(entry.at, `${label}.at`);
    if (!isPlainObject(entry.changes)) throw new Error(`${label}.changes must be an object`);

    const changedFields = Object.keys(entry.changes);
    if (!changedFields.length) throw new Error(`${label}.changes must not be empty`);
    for (const field of changedFields) {
      if (!nowFields[field]) throw new Error(`${label}.changes contains unknown field "${field}"`);
      assertFieldValue(field, entry.changes[field], `${label}.changes.${field}`);
    }
  });

  return document;
}

export async function loadNow(projectRoot) {
  const filename = path.join(projectRoot, 'content', 'now.json');
  const source = await readFile(filename, 'utf8');
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new Error(`Could not parse content/now.json: ${error.message}`);
  }
  return validateNowDocument(document);
}

export function applyNowUpdate(document, input, timestamp = new Date().toISOString()) {
  validateNowDocument(document);
  assertTimestamp(timestamp, 'Update timestamp');

  const values = isPlainObject(input?.values) ? input.values : {};
  const clear = isPlainObject(input?.clear) ? input.clear : {};
  const changes = {};

  for (const field of Object.keys(nowFields)) {
    let nextValue;
    if (clear[field] === true) {
      nextValue = null;
    } else if (typeof values[field] === 'string' && values[field].trim()) {
      nextValue = values[field].trim();
      assertFieldValue(field, nextValue, field, { nullable: false });
    } else {
      continue;
    }

    if (document.current[field] !== nextValue) changes[field] = nextValue;
  }

  if (!Object.keys(changes).length) return { changed: false, document };

  const nextDocument = {
    current: {
      ...document.current,
      ...changes,
      updatedAt: timestamp,
    },
    history: [
      { at: timestamp, changes },
      ...document.history,
    ].slice(0, nowHistoryLimit),
  };

  validateNowDocument(nextDocument);
  return { changed: true, document: nextDocument };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date(timestamp));
}

function renderTime(timestamp) {
  return `<time datetime="${escapeHtml(timestamp)}">${escapeHtml(formatTimestamp(timestamp))}</time>`;
}

function renderCurrent(document) {
  const rows = Object.entries(nowFields)
    .filter(([field]) => document.current[field] !== null)
    .map(([field, definition]) => [
      '<div class="now-current-row">',
      `<dt>${definition.label}</dt>`,
      `<dd>${escapeHtml(document.current[field])}</dd>`,
      '</div>',
    ].join(''))
    .join('');

  if (!rows) return '<p class="now-empty">Nothing here yet. Probably got distracted.</p>';

  const updated = document.current.updatedAt
    ? `<p class="now-updated">Updated ${renderTime(document.current.updatedAt)}</p>`
    : '';
  return `<dl class="now-current">${rows}</dl>${updated}`;
}

function renderChange(change) {
  return Object.entries(change)
    .map(([field, value]) => {
      const renderedValue = value === null
        ? '<em>cleared</em>'
        : `<span>${escapeHtml(value)}</span>`;
      return `<span class="now-change"><strong>${nowFields[field].label}:</strong> ${renderedValue}</span>`;
    })
    .join('');
}

function renderHistory(entries, emptyMessage) {
  if (!entries.length) return `<p class="now-empty">${escapeHtml(emptyMessage)}</p>`;
  return [
    '<ol class="now-history">',
    ...entries.map((entry) => [
      '<li>',
      renderTime(entry.at),
      `<div>${renderChange(entry.changes)}</div>`,
      '</li>',
    ].join('')),
    '</ol>',
  ].join('');
}

export function renderNowHome(document) {
  validateNowDocument(document);
  const recent = document.history.slice(0, 3);
  return [
    renderCurrent(document),
    '<h3 class="now-subtitle">Recently</h3>',
    renderHistory(recent, 'No changes recorded yet.'),
    '<a class="link now-archive-link" href="/now/">View archive →</a>',
  ].join('');
}

export function renderNowArchive(document) {
  validateNowDocument(document);
  return [
    '<section class="now-archive-current">',
    '<h2>Current</h2>',
    renderCurrent(document),
    '</section>',
    '<section>',
    `<h2>History <small>(${document.history.length}/${nowHistoryLimit})</small></h2>`,
    renderHistory(document.history, 'The archive is empty.'),
    '</section>',
  ].join('');
}
