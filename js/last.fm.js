// Music source switcher for Last.fm / ListenBrainz
// Original Last.fm snippet was adapted into this unified widget.

const MUSIC_SOURCE_STORAGE_KEY = 'music-source';
const TRACK_CACHE_PREFIX = 'dott-track:';
const TRACK_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const DEFAULT_SOURCE = 'lastfm';

const SOURCES = {
  lastfm: {
    label: 'Last.fm',
    profileUrl: 'https://last.fm/user/somedott',
    fetch: fetchFromLastFm,
  },
  listenbrainz: {
    label: 'ListenBrainz',
    profileUrl: 'https://listenbrainz.org/user/somedott/',
    fetch: fetchFromListenBrainz,
  },
};

const lastFmApiKey = ['4c67', '2513', '1b21', '3c8d', '0955', '896b', '938a', '34b0'].join('');
const lastFmUsername = 'someDott';
const listenBrainzUsername = 'somedott';

const pollIntervals = {
  lastfm: 15000,
  listenbrainz: 20000,
};

let currentSource = readStoredSource();
let refreshTimer = null;
let refreshInFlight = false;
let refreshQueued = false;
let refreshGeneration = 0;
let currentTrackFingerprint = '';
const coverLookupCache = new Map();

function getEls() {
  return {
    albumTitle: document.getElementById('album-title'),
    trackTitle: document.getElementById('track-title'),
    artistName: document.getElementById('artist-name'),
    albumCover: document.getElementById('album-cover'),
    sourceMeta: document.getElementById('music-source-meta'),
    sourceToggle: document.getElementById('music-source-toggle'),
  };
}

function readStoredSource() {
  try {
    const stored = localStorage.getItem(MUSIC_SOURCE_STORAGE_KEY);
    return stored && SOURCES[stored] ? stored : DEFAULT_SOURCE;
  } catch {
    return DEFAULT_SOURCE;
  }
}

function setStoredSource(source) {
  try {
    localStorage.setItem(MUSIC_SOURCE_STORAGE_KEY, source);
  } catch {
    // Switching sources still works for the current tab.
  }
}

function readTrackCache(source) {
  try {
    const cached = JSON.parse(localStorage.getItem(`${TRACK_CACHE_PREFIX}${source}`));
    if (
      !cached
      || !cached.value
      || typeof cached.value !== 'object'
      || !Number.isFinite(cached.savedAt)
      || Date.now() - cached.savedAt > TRACK_CACHE_MAX_AGE
    ) return null;
    return cached.value;
  } catch {
    return null;
  }
}

function writeTrackCache(source, track) {
  if (!track) return;
  try {
    localStorage.setItem(`${TRACK_CACHE_PREFIX}${source}`, JSON.stringify({
      savedAt: Date.now(),
      value: track,
    }));
  } catch {
    // A fresh network response can still be rendered without storage.
  }
}

function restoreCachedTrack() {
  const track = readTrackCache(currentSource);
  if (!track) return false;
  renderTrack(track);
  return true;
}

function getLargestLastFmImage(images) {
  if (!Array.isArray(images)) return '';

  for (let index = images.length - 1; index >= 0; index -= 1) {
    const imageUrl = images[index]?.['#text'];
    if (imageUrl) return imageUrl;
  }

  return '';
}

function describeListen(metadata) {
  const info = metadata?.additional_info;
  const read = (key) => typeof info?.[key] === 'string' ? info[key].trim() : '';
  const player = read('media_player');
  const scrobbler = read('original_submission_client') || read('submission_client');

  if (!player && !scrobbler) return '';
  if (/\bimport(?:er|ed|ing)?\b/i.test(scrobbler)) return `imported via ${scrobbler}`;
  const sameClient = player && scrobbler && player.toLowerCase() === scrobbler.toLowerCase();

  if (player && scrobbler && !sameClient) return `${player} → ${scrobbler}`;
  if (scrobbler) return `via ${scrobbler}`;
  return `in ${player}`;
}

function renderSourceMeta(element, listenVia = '', failed = false) {
  if (!element) return;

  const source = SOURCES[currentSource];
  const link = document.createElement('a');
  link.href = source.profileUrl;
  link.className = 'link';
  link.textContent = source.label;
  element.replaceChildren('Source: ', link, ` (${listenVia || 'via —'})`);
  if (failed) element.append(' · fetch failed');
}

async function requestLastFmCover(method, params) {
  const query = new URLSearchParams({
    method,
    api_key: lastFmApiKey,
    autocorrect: '1',
    format: 'json',
    ...params,
  });
  const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${query}`);
  if (!response.ok) return '';

  const data = await response.json();
  return getLargestLastFmImage(data?.album?.image || data?.track?.album?.image);
}

async function getCoverFromLastFm(trackMetadata) {
  const artist = trackMetadata?.artist_name || '';
  const album = trackMetadata?.release_name || '';
  const title = trackMetadata?.track_name || '';
  const cacheKey = `${artist}\n${album}\n${title}`.toLowerCase();

  if (coverLookupCache.has(cacheKey)) {
    return coverLookupCache.get(cacheKey);
  }

  const lookup = (async function () {
    try {
      if (artist && album) {
        const albumCover = await requestLastFmCover('album.getInfo', {
          artist,
          album,
        });
        if (albumCover) return albumCover;
      }

      if (artist && title) {
        return await requestLastFmCover('track.getInfo', {
          artist,
          track: title,
        });
      }
    } catch (error) {
      console.warn('Last.fm cover lookup failed:', error);
    }

    return '';
  })();

  coverLookupCache.set(cacheKey, lookup);
  return lookup;
}

function renderTrack(track) {
  const els = getEls();
  if (!els.albumTitle || !els.trackTitle || !els.artistName || !els.albumCover || !els.sourceMeta) {
    return;
  }

  if (!track) {
    els.albumTitle.innerText = '—';
    els.trackTitle.innerText = 'Ничего не играет';
    els.artistName.innerText = '';
    els.albumCover.removeAttribute('src');
    els.albumCover.alt = 'No cover';
    renderSourceMeta(els.sourceMeta);
    currentTrackFingerprint = '';
    return;
  }

  const fingerprint = `${currentSource}:${track.artist}|${track.title}|${track.album}|${track.isNowPlaying}|${track.listenVia || ''}`;
  if (fingerprint === currentTrackFingerprint) {
    return;
  }
  currentTrackFingerprint = fingerprint;

  els.albumTitle.innerText = track.album || '—';
  els.artistName.innerText = track.artist || '';
  els.albumCover.alt = track.title ? `${track.title} cover` : 'Album cover';
  els.albumCover.onerror = null;

  if (track.cover) {
    els.albumCover.src = track.cover;
  } else {
    els.albumCover.removeAttribute('src');
  }

  if (track.isNowPlaying) {
    els.trackTitle.innerHTML = `${escapeHtml(track.title || '')} <span style="background-color: #d95763aa;">(LIVE)</span>`;
  } else {
    els.trackTitle.innerText = track.title || '';
  }

  renderSourceMeta(els.sourceMeta, track.listenVia);
}

function renderError() {
  const els = getEls();
  renderSourceMeta(els.sourceMeta, '', true);
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchFromLastFm() {
  const response = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${lastFmUsername}&api_key=${lastFmApiKey}&format=json`);
  const data = await response.json();
  const recentTracks = data?.recenttracks?.track || [];
  if (!recentTracks.length) return null;

  const currentTrack = recentTracks[0];
  return {
    title: currentTrack.name || '',
    artist: currentTrack.artist?.['#text'] || '',
    album: currentTrack.album?.['#text'] || '',
    cover: currentTrack.image?.[3]?.['#text'] || '',
    isNowPlaying: currentTrack['@attr']?.nowplaying === 'true',
  };
}

async function fetchFromListenBrainz() {
  const playingNowResponse = await fetch(`https://api.listenbrainz.org/1/user/${listenBrainzUsername}/playing-now`);
  const playingNowData = await playingNowResponse.json();
  const playingNowTrack = playingNowData?.payload?.listens?.[0];
  const isPlayingNow = (
    playingNowData?.payload?.playing_now === true
    || playingNowTrack?.playing_now === true
  );

  if (isPlayingNow && playingNowTrack) {
    const metadata = playingNowTrack.track_metadata;
    return {
      title: metadata?.track_name || '',
      artist: metadata?.artist_name || '',
      album: metadata?.release_name || '',
      cover: await getCoverFromLastFm(metadata),
      isNowPlaying: true,
      listenVia: describeListen(metadata),
    };
  }

  const recentResponse = await fetch(`https://api.listenbrainz.org/1/user/${listenBrainzUsername}/listens?count=1`);
  const recentData = await recentResponse.json();
  const recentTrack = recentData?.payload?.listens?.[0];
  if (!recentTrack) return null;
  const metadata = recentTrack.track_metadata;

  return {
    title: metadata?.track_name || '',
    artist: metadata?.artist_name || '',
    album: metadata?.release_name || '',
    cover: await getCoverFromLastFm(metadata),
    isNowPlaying: false,
    listenVia: describeListen(metadata),
  };
}

async function refreshTrack() {
  if (document.hidden) return;

  if (refreshInFlight) {
    refreshQueued = true;
    return;
  }

  refreshInFlight = true;
  refreshQueued = false;
  const source = currentSource;
  const generation = refreshGeneration;

  try {
    const track = await SOURCES[source].fetch();
    if (source === currentSource && generation === refreshGeneration && !document.hidden) {
      writeTrackCache(source, track);
      renderTrack(track);
    }
  } catch (error) {
    console.error('music widget error:', error);
    if (source === currentSource && generation === refreshGeneration && !document.hidden) {
      renderError();
    }
  } finally {
    refreshInFlight = false;

    if (document.hidden) return;

    if (refreshQueued) {
      refreshQueued = false;
      void refreshTrack();
    } else {
      scheduleRefresh();
    }
  }
}

function clearRefreshTimer() {
  if (!refreshTimer) return;
  clearTimeout(refreshTimer);
  refreshTimer = null;
}

function scheduleRefresh() {
  clearRefreshTimer();
  if (document.hidden) return;

  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshTrack();
  }, pollIntervals[currentSource] || 20000);
}

function refreshNow() {
  clearRefreshTimer();
  if (document.hidden) return;
  void refreshTrack();
}

function updateToggleLabel() {
  const els = getEls();
  if (!els.sourceToggle) return;
  const source = SOURCES[currentSource];
  els.sourceToggle.innerText = source.label;
  els.sourceToggle.title = `Switch music source (current: ${source.label})`;
}

function switchSource() {
  const nextSource = currentSource === 'lastfm' ? 'listenbrainz' : 'lastfm';
  currentSource = nextSource;
  refreshGeneration += 1;
  currentTrackFingerprint = '';
  setStoredSource(currentSource);
  updateToggleLabel();
  if (!restoreCachedTrack()) renderSourceMeta(getEls().sourceMeta, 'via …');
  refreshNow();
}

function handleVisibilityChange() {
  clearRefreshTimer();
  refreshGeneration += 1;

  if (document.hidden) {
    refreshQueued = false;
    return;
  }

  refreshNow();
}

function initMusicWidget() {
  const els = getEls();
  if (els.sourceToggle) {
    els.sourceToggle.addEventListener('click', switchSource);
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  updateToggleLabel();
  restoreCachedTrack();
  refreshNow();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMusicWidget, { once: true });
} else {
  initMusicWidget();
}
