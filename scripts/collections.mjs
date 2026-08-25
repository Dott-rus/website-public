import { assertHref, assertText as sharedAssertText, escapeHtml } from './content-utils.mjs';
import { parseYaml } from './content-yaml.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const assertText = (value, label, { max = 240 } = {}) => sharedAssertText(value, label, max);
const idPattern = /^[a-z0-9-]+$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateCollections(document, source = 'content/collections.yaml') {
  if (!isPlainObject(document)) throw new Error(`${source} must contain an object`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document.updatedAt || '')) {
    throw new Error(`${source}.updatedAt must use YYYY-MM-DD`);
  }
  if (!Array.isArray(document.statuses) || !document.statuses.length) {
    throw new Error(`${source}.statuses must be a non-empty array`);
  }
  if (!Array.isArray(document.groups) || !document.groups.length) {
    throw new Error(`${source}.groups must be a non-empty array`);
  }

  const statusIds = new Set();
  document.statuses.forEach((status, statusIndex) => {
    const label = `${source}.statuses[${statusIndex}]`;
    if (!isPlainObject(status)) throw new Error(`${label} must be an object`);
    assertText(status.id, `${label}.id`, { max: 40 });
    if (!idPattern.test(status.id)) throw new Error(`${label}.id is not URL-safe`);
    if (statusIds.has(status.id)) throw new Error(`${label}.id is duplicated`);
    statusIds.add(status.id);
    assertText(status.label, `${label}.label`, { max: 60 });
  });

  const groupIds = new Set();
  document.groups.forEach((group, groupIndex) => {
    const label = `${source}.groups[${groupIndex}]`;
    if (!isPlainObject(group)) throw new Error(`${label} must be an object`);
    assertText(group.id, `${label}.id`, { max: 40 });
    if (!idPattern.test(group.id)) throw new Error(`${label}.id is not URL-safe`);
    if (groupIds.has(group.id)) throw new Error(`${label}.id is duplicated`);
    groupIds.add(group.id);
    assertText(group.symbol, `${label}.symbol`, { max: 4 });
    assertText(group.title, `${label}.title`, { max: 80 });
    assertText(group.description, `${label}.description`);
    if (!Array.isArray(group.items) || !group.items.length) {
      throw new Error(`${label}.items must be a non-empty array`);
    }

    group.items.forEach((item, itemIndex) => {
      const itemLabel = `${label}.items[${itemIndex}]`;
      if (!isPlainObject(item)) throw new Error(`${itemLabel} must be an object`);
      assertText(item.title, `${itemLabel}.title`, { max: 100 });
      assertText(item.meta, `${itemLabel}.meta`, { max: 120 });
      assertText(item.status, `${itemLabel}.status`, { max: 40 });
      if (!statusIds.has(item.status)) {
        throw new Error(`${itemLabel}.status references unknown status "${item.status}"`);
      }
      if (item.note !== undefined) {
        assertText(item.note, `${itemLabel}.note`);
      }
      assertHref(item.href, `${itemLabel}.href`);
      assertHref(item.cover, `${itemLabel}.cover`);
    });
  });

  return document;
}

export async function loadCollections(projectRoot) {
  const filename = path.join(projectRoot, 'content', 'collections.yaml');
  let document;
  try {
    document = parseYaml(await readFile(filename, 'utf8'), 'content/collections.yaml');
  } catch (error) {
    throw error;
  }
  return validateCollections(document);
}

function renderItem(item, statuses) {
  const statusLabel = statuses.get(item.status);
  const note = item.note
    ? `<span class="simple-collection-note">${escapeHtml(item.note)}</span>`
    : '';
  const cover = item.cover
    ? `<img class="stuff-cover" src="${escapeHtml(item.cover)}" alt="" width="52" height="52" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '';
  const content = [
    cover,
    '<span class="simple-collection-copy">',
    `<strong>${escapeHtml(item.title)}</strong>`,
    `<small>${escapeHtml(item.meta)}</small>`,
    note,
    '</span>',
    `<span class="stuff-item-status">${escapeHtml(statusLabel)}</span>`,
  ].join('');

  if (!item.href) return `<li class="simple-collection-item" data-stuff-status="${escapeHtml(item.status)}">${content}</li>`;
  const external = /^https:\/\//i.test(item.href);
  const attributes = external ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<li class="simple-collection-item simple-collection-item--linked" data-stuff-status="${escapeHtml(item.status)}"><a href="${escapeHtml(item.href)}"${attributes}>${content}<span class="stuff-item-arrow" aria-hidden="true">${external ? '↗' : '→'}</span></a></li>`;
}

export function renderCollections(document) {
  validateCollections(document);
  const statuses = new Map(document.statuses.map((status) => [status.id, status.label]));
  return document.groups.map((group) => [
    `<fieldset class="simple-collection-group" id="${escapeHtml(group.id)}" data-stuff-group>`,
    `<legend>${escapeHtml(group.title)}</legend>`,
    `<p>${escapeHtml(group.description)}</p>`,
    `<ul class="simple-collection-items">${group.items.map((item) => renderItem(item, statuses)).join('')}</ul>`,
    '</fieldset>',
  ].join('')).join('');
}

export function renderCollectionIndex(document) {
  validateCollections(document);
  return document.groups.map((group) =>
    `[<a class="link" href="#${escapeHtml(group.id)}">${escapeHtml(group.title)}</a>]`,
  ).join(' ');
}

export function renderStuffFilters(document) {
  validateCollections(document);
  const counts = new Map();
  for (const group of document.groups) {
    for (const item of group.items) {
      counts.set(item.status, (counts.get(item.status) || 0) + 1);
    }
  }

  const total = document.groups.reduce((count, group) => count + group.items.length, 0);
  const filters = [{ id: 'all', label: 'All', count: total }, ...document.statuses.map((status) => ({
    ...status,
    count: counts.get(status.id) || 0,
  }))];

  return filters.map((filter) => {
    const active = filter.id === 'all' ? ' is-active' : '';
    const pressed = filter.id === 'all' ? 'true' : 'false';
    const disabled = filter.count === 0 ? ' disabled' : '';
    return `<button class="stuff-filter${active}" type="button" data-stuff-filter="${escapeHtml(filter.id)}" aria-pressed="${pressed}"${disabled}>${escapeHtml(filter.label)} <small>${filter.count}</small></button>`;
  }).join('');
}
