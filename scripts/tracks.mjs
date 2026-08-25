import { escapeHtml } from './content-utils.mjs';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const trackListMarker = '<!-- TRACK_LIST -->';

function formatReleaseDate(released) {
  if (!released) return '';

  const [year, month, day] = released.split('-');
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${day} ${monthNames[Number(month) - 1]} ${year}`;
}

function validateIsoDate(value, sourcePath) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${sourcePath}: "released" must use YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${sourcePath}: "${value}" is not a valid release date`);
  }
}

async function normalizeTrack(data, sourcePath, projectRoot) {
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error(`${sourcePath}: track data must be a JSON object`);
  }
  if (typeof data.draft !== 'boolean') {
    throw new Error(`${sourcePath}: "draft" must be true or false`);
  }

  const stringFields = [
    'slug',
    'title',
    'artist',
    'album',
    'released',
    'duration',
    'spotifyTrackId',
    'cover',
    'description',
  ];
  const track = { draft: data.draft, sourcePath };

  for (const field of stringFields) {
    if (data[field] !== undefined && typeof data[field] !== 'string') {
      throw new Error(`${sourcePath}: "${field}" must be a string`);
    }
    track[field] = data[field]?.trim() || '';
  }

  for (const field of ['slug', 'title', 'artist']) {
    if (!track[field]) {
      throw new Error(`${sourcePath}: "${field}" is required even for drafts`);
    }
  }

  if (!/^[A-Za-z0-9-]+$/.test(track.slug)) {
    throw new Error(
      `${sourcePath}: "slug" may contain only letters, numbers, and hyphens`,
    );
  }
  if (track.released) validateIsoDate(track.released, sourcePath);
  if (track.duration && !/^\d+:[0-5]\d$/.test(track.duration)) {
    throw new Error(`${sourcePath}: "duration" must look like 2:07`);
  }
  if (
    track.spotifyTrackId &&
    !/^[A-Za-z0-9]{22}$/.test(track.spotifyTrackId)
  ) {
    throw new Error(`${sourcePath}: "spotifyTrackId" is not a Spotify track ID`);
  }
  if (track.cover && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(track.cover)) {
    throw new Error(`${sourcePath}: "cover" must be a filename, not a path`);
  }

  if (!track.draft) {
    for (const field of [
      'album',
      'released',
      'duration',
      'spotifyTrackId',
      'cover',
      'description',
    ]) {
      if (!track[field]) {
        throw new Error(
          `${sourcePath}: published track is missing required "${field}"`,
        );
      }
    }
  }

  if (track.cover) {
    const coverPath = path.join(projectRoot, 'img', 'tracks', track.cover);
    try {
      await access(coverPath);
    } catch {
      throw new Error(
        `${sourcePath}: cover file does not exist: img/tracks/${track.cover}`,
      );
    }
  }

  return track;
}

export async function loadTracks(projectRoot) {
  const contentDirectory = path.join(projectRoot, 'content', 'tracks');
  const entries = (await readdir(contentDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!entries.length) {
    throw new Error('No track files found in content/tracks/');
  }

  const tracks = [];
  const slugs = new Map();
  for (const entry of entries) {
    const sourcePath = path.join('content', 'tracks', entry.name);
    let data;
    try {
      data = JSON.parse(
        await readFile(path.join(contentDirectory, entry.name), 'utf8'),
      );
    } catch (error) {
      throw new Error(`${sourcePath}: invalid JSON (${error.message})`);
    }

    const track = await normalizeTrack(data, sourcePath, projectRoot);
    if (slugs.has(track.slug)) {
      throw new Error(
        `${sourcePath}: duplicate slug "${track.slug}" (also used by ${slugs.get(track.slug)})`,
      );
    }
    slugs.set(track.slug, sourcePath);
    tracks.push(track);
  }

  return tracks.sort((a, b) => {
    if (a.draft !== b.draft) return a.draft ? -1 : 1;
    return (b.released || '').localeCompare(a.released || '');
  });
}

function renderCover(track, kind) {
  const className = kind === 'card' ? 'track-card-cover' : 'track-artwork';
  const size = kind === 'card' ? 80 : 300;

  if (!track.cover) {
    return `<span class="${className} track-cover-placeholder" aria-label="Cover not added yet">?</span>`;
  }

  return `<img class="${className}" src="/img/tracks/${escapeHtml(track.cover)}" alt="${escapeHtml(track.title)} cover art" width="${size}" height="${size}">`;
}

function renderTrackCards(tracks) {
  return tracks
    .map((track) => {
      const meta = [track.artist];
      if (
        track.album &&
        track.album.localeCompare(track.title, undefined, {
          sensitivity: 'accent',
        }) !== 0
      ) {
        meta.push(track.album);
      }
      meta.push(track.released ? track.released.slice(0, 4) : 'date TBA');

      const draftClass = track.draft ? ' track-card--draft' : '';
      const draftBadge = track.draft
        ? '<span class="track-draft-badge">draft</span>'
        : '';

      return [
        `<a class="track-card${draftClass}" href="/tracks/${escapeHtml(track.slug)}/">`,
        renderCover(track, 'card'),
        '<span class="track-card-copy">',
        `<span class="track-card-title">${escapeHtml(track.title)}${draftBadge}</span>`,
        `<span class="track-card-meta">${escapeHtml(meta.join(' · '))}</span>`,
        `<span class="track-card-time">${escapeHtml(track.duration || '--:--')}</span>`,
        '</span>',
        '<span class="track-card-arrow" aria-hidden="true">→</span>',
        '</a>',
      ].join('');
    })
    .join('\n');
}

export function renderTrackIndex(html, tracks) {
  if (!html.includes(trackListMarker)) {
    throw new Error('tracks/index.html is missing the TRACK_LIST marker');
  }
  return html.replace(trackListMarker, renderTrackCards(tracks));
}

function renderSpotifyEmbed(track) {
  if (!track.spotifyTrackId) {
    return '<p>Spotify link not added yet.</p>';
  }

  return [
    '<p>Listen to the track:</p>',
    `<iframe class="spotify-embed" src="https://open.spotify.com/embed/track/${escapeHtml(track.spotifyTrackId)}?utm_source=generator" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" title="Listen to ${escapeHtml(track.title)} on Spotify"></iframe>`,
  ].join('\n');
}

export function renderTrackTemplate(template, track) {
  const rawValues = {
    cover_markup: renderCover(track, 'detail'),
    draft_badge: track.draft
      ? '<span class="track-draft-badge">draft — local preview only</span>'
      : '',
    released_markup: track.released
      ? `<time datetime="${escapeHtml(track.released)}">${escapeHtml(formatReleaseDate(track.released))}</time>`
      : 'TBA',
    spotify_embed: renderSpotifyEmbed(track),
  };
  const values = {
    album: track.album || 'TBA',
    artist: track.artist,
    description: track.description || 'Description not written yet.',
    duration: track.duration || '--:--',
    page_description: `${track.title} by ${track.artist}. ${track.description || 'Track details and listening link.'}`,
    page_title: `${track.title} by ${track.artist} — somedott.space`,
    title: track.title,
  };

  let output = template.replace(
    /\{\{\{([a-z_]+)\}\}\}/g,
    (match, key) => rawValues[key] ?? match,
  );
  output = output.replace(
    /\{\{([a-z_]+)\}\}/g,
    (match, key) => (key in values ? escapeHtml(values[key]) : match),
  );

  const unresolvedToken = output.match(/\{\{\{?[a-z_]+\}?\}\}/);
  if (unresolvedToken) {
    throw new Error(
      `${track.sourcePath}: unresolved template token ${unresolvedToken[0]}`,
    );
  }
  return output;
}
