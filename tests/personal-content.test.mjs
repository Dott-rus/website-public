import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderCollectionIndex,
  renderCollections,
  renderStuffFilters,
  validateCollections,
} from '../scripts/collections.mjs';
import {
  addFeedEntry,
  composeFeed,
  renderFeed,
  renderFeedFilters,
  validateFeedEntries,
} from '../scripts/feed.mjs';

function collectionDocument() {
  return {
    updatedAt: '2026-08-02',
    statuses: [
      { id: 'in-progress', label: 'In progress' },
      { id: 'on-pause', label: 'On pause' },
    ],
    groups: [{
      id: 'things',
      symbol: '◆',
      title: 'Things & stuff',
      description: 'A <growing> shelf.',
      items: [{
        title: 'Small thing',
        meta: 'test',
        status: 'in-progress',
        note: 'Useful & nice.',
        href: '/about/',
      }],
    }],
  };
}

function nowDocument() {
  return {
    current: {
      doing: 'Testing the feed',
      consuming: null,
      note: null,
      updatedAt: '2026-08-01T15:44:04.071Z',
    },
    history: [],
  };
}

test('collections render escaped content and an index count', () => {
  const document = collectionDocument();
  const content = renderCollections(document);
  const index = renderCollectionIndex(document);

  assert.match(content, /Things &amp; stuff/);
  assert.match(content, /A &lt;growing&gt; shelf/);
  assert.doesNotMatch(content, /<growing>/);
  assert.match(index, /\[<a[^>]+>Things &amp; stuff<\/a>\]/);
  assert.match(content, /data-stuff-status="in-progress"/);
  assert.match(renderStuffFilters(document), /On pause <small>0<\/small>/);
});

test('collections reject unsafe links', () => {
  const document = collectionDocument();
  document.groups[0].items[0].href = 'javascript:alert(1)';
  assert.throws(() => validateCollections(document), /root-relative path or HTTPS URL/);
});

test('collections reject item states missing from the YAML status list', () => {
  const document = collectionDocument();
  document.groups[0].items[0].status = 'invented';
  assert.throws(() => validateCollections(document), /references unknown status/);
});

test('feed combines curated posts, NOW and published tracks in date order', () => {
  const curated = [{
    id: 'old-note',
    type: 'note',
    date: '2025-01-01',
    title: 'Old note',
    body: 'Still useful.',
  }];
  const tracks = [{
    slug: 'new-track',
    title: 'New track',
    artist: 'someDott',
    description: 'A release.',
    released: '2026-02-01',
    cover: 'cover.jpg',
    draft: false,
  }];

  const feed = composeFeed(curated, tracks, nowDocument());
  assert.deepEqual(feed.map((entry) => entry.type), ['now', 'music', 'note']);
  assert.match(renderFeed(feed), /Doing: Testing the feed/);
  assert.match(renderFeedFilters(feed), /Everything <small>3<\/small>/);
});

test('feed rejects unsupported types and unsafe links', () => {
  const entry = {
    id: 'bad-entry',
    type: 'unknown',
    date: '2026-08-02',
    title: 'Nope',
    body: 'Nope.',
    href: 'javascript:alert(1)',
    linkLabel: 'Nope',
  };
  assert.throws(() => validateFeedEntries([entry]), /type is not supported/);
  entry.type = 'note';
  assert.throws(() => validateFeedEntries([entry]), /root-relative path or HTTPS URL/);
});

test('workflow feed updates generate defaults and preserve existing entries', () => {
  const existing = [{
    id: 'older-entry',
    type: 'life',
    date: '2026-08-01',
    title: 'Older entry',
    body: 'Already here.',
  }];
  const result = addFeedEntry(existing, {
    type: 'photo',
    title: 'Evening walk',
    body: 'Took some photos.',
    href: 'https://album.somedott.space/',
  }, '2026-08-03T12:34:56.000Z');

  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[1], existing[0]);
  assert.deepEqual(result.entry, {
    id: 'photo-20260803123456',
    type: 'photo',
    date: '2026-08-03T12:34:56.000Z',
    title: 'Evening walk',
    body: 'Took some photos.',
    href: 'https://album.somedott.space/',
    linkLabel: 'Open',
  });
});

test('workflow feed updates reject missing content and duplicate explicit IDs', () => {
  assert.throws(
    () => addFeedEntry([], { type: 'music', title: 'Nope', body: 'Nope.' }),
    /FEED_TYPE must be one of/,
  );

  const existing = [{
    id: 'same-id',
    type: 'life',
    date: '2026-08-01',
    title: 'Existing',
    body: 'Existing body.',
  }];
  assert.throws(
    () => addFeedEntry(existing, {
      id: 'same-id',
      type: 'note',
      title: 'Duplicate',
      body: 'Duplicate body.',
    }),
    /id is duplicated/,
  );
});
