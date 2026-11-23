const API = 'http://127.0.0.1:8787';
const LASTFM_KEY = [
  '4c67',
  '2513',
  '1b21',
  '3c8d',
  '0955',
  '896b',
  '938a',
  '34b0',
].join('');
const $ = (id) => document.getElementById(id);
const set = (id, v) => {
  const e = $(id);
  if (e) e.textContent = v;
};
const pct = (v) => `${Math.round(Number(v) || 0)}%`;
const gb = (b) => `${(Number(b || 0) / 1073741824).toFixed(1)}G`;
const rate = (b) => {
  b = Number(b) || 0;
  if (b > 1048576) return `${(b / 1048576).toFixed(1)} MB/s`;
  if (b > 1024) return `${(b / 1024).toFixed(0)} KB/s`;
  return `${b.toFixed(0)} B/s`;
};
const dur = (s) => {
  s = Math.max(0, Number(s) || 0);
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : `${h}h ${m}m`;
};
const mmss = (us) => {
  const s = Math.max(0, Math.floor((Number(us) || 0) / 1e6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const width = (id, v) => {
  const e = $(id);
  if (e) e.style.width = `${Math.max(0, Math.min(100, Number(v) || 0))}%`;
};
function tick() {
  const d = new Date();
  set(
    'clock',
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  );
  set(
    'date',
    d.toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );
}
tick();
setInterval(tick, 1000);
const coverCache = new Map();
let coverFingerprint = '';
function largestLastFmImage(images) {
  if (!Array.isArray(images)) return '';
  for (let i = images.length - 1; i >= 0; i--) {
    const u = images[i]?.['#text'];
    if (u) return u;
  }
  return '';
}
async function lastFmCover(m) {
  const artist = m?.artist || '',
    album = m?.album || '',
    title = m?.title || '';
  const key = `${artist}\n${album}\n${title}`.toLowerCase();
  if (coverCache.has(key)) return coverCache.get(key);
  const p = (async () => {
    try {
      if (artist && album) {
        const q = new URLSearchParams({
          method: 'album.getInfo',
          api_key: LASTFM_KEY,
          autocorrect: '1',
          format: 'json',
          artist,
          album,
        });
        const r = await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`);
        if (r.ok) {
          const u = largestLastFmImage((await r.json())?.album?.image);
          if (u) return u;
        }
      }
      if (artist && title) {
        const q = new URLSearchParams({
          method: 'track.getInfo',
          api_key: LASTFM_KEY,
          autocorrect: '1',
          format: 'json',
          artist,
          track: title,
        });
        const r = await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`);
        if (r.ok)
          return largestLastFmImage((await r.json())?.track?.album?.image);
      }
    } catch {}
    return '';
  })();
  coverCache.set(key, p);
  return p;
}
async function updateCover(m) {
  const fp = `${m?.artist || ''}|${m?.album || ''}|${m?.title || ''}|${m?.art_url || ''}`;
  if (fp === coverFingerprint) return;
  coverFingerprint = fp;
  const img = $('track-cover');
  let fallback = '';
  if (/^https?:\/\//i.test(m?.art_url || '')) fallback = m.art_url;
  else if (m?.art_url) fallback = `${API}/v1/art`;
  const fm = await lastFmCover(m);
  if (fp !== coverFingerprint) return;
  const src = fm || fallback;
  if (src) {
    img.onerror = () => {
      if (fallback && img.src !== fallback) {
        img.onerror = () => img.removeAttribute('src');
        img.src = fallback;
      } else img.removeAttribute('src');
    };
    img.src = src;
  } else img.removeAttribute('src');
}
function render(x) {
  $('offline').hidden = true;
  $('dashboard').hidden = false;
  $('local-link').classList.remove('is-offline');
  set('hostname', x.hostname || 'dotlap');
  set('os', x.os?.pretty || 'Linux');
  set('cpu', pct(x.cpu?.percent));
  set(
    'cpu-temp',
    x.temperature_c != null ? `${Math.round(x.temperature_c)}°C` : '—',
  );
  set('gpu', x.gpu?.util_percent != null ? pct(x.gpu.util_percent) : '—');
  set(
    'gpu-temp',
    x.gpu?.temperature_c != null
      ? `${Math.round(x.gpu.temperature_c)}°C · ${x.gpu.name || 'GPU'}`
      : '—',
  );
  set('ram', pct(x.memory?.percent));
  set('ram-detail', `${gb(x.memory?.used)} / ${gb(x.memory?.total)}`);
  set('battery', x.battery?.percent != null ? pct(x.battery.percent) : '—');
  set('battery-state', x.battery?.status || '—');
  set('disk', `${pct(x.disk?.percent)} · ${gb(x.disk?.free)} free`);
  set(
    'home-disk',
    `${pct(x.home_disk?.percent)} · ${gb(x.home_disk?.free)} free`,
  );
  width('disk-bar', x.disk?.percent);
  width('home-bar', x.home_disk?.percent);
  const vp = x.gpu?.memory_total_mb
    ? (x.gpu.memory_used_mb / x.gpu.memory_total_mb) * 100
    : 0;
  width('vram-bar', vp);
  set(
    'vram',
    x.gpu?.memory_total_mb
      ? `${Math.round(x.gpu.memory_used_mb)} / ${Math.round(x.gpu.memory_total_mb)}M`
      : '—',
  );
  set('rx-rate', rate(x.network?.rx_rate));
  set('tx-rate', rate(x.network?.tx_rate));
  set(
    'network',
    `${x.network?.interface || '—'} · ${x.network?.ip || 'no address'}`,
  );
  set('uptime', dur(x.uptime_seconds));
  set(
    'load',
    (x.load || []).map((v) => Number(v).toFixed(2)).join(' / ') || '—',
  );
  set('kernel', x.os?.kernel || '—');
  set(
    'swap',
    x.memory?.swap_total
      ? `${pct(x.memory.swap_percent)} · ${gb(x.memory.swap_used)}`
      : 'off',
  );
  set(
    'gpu-power',
    x.gpu?.power_w != null ? `${Number(x.gpu.power_w).toFixed(1)} W` : '—',
  );
  const m = x.media || {};
  updateCover(m);
  set('track-title', m.title || 'Nothing playing');
  set('track-artist', m.artist || '—');
  set('track-album', m.album || m.player || '—');
  set('media-state', `${m.player || 'media'} · ${m.status || 'idle'}`);
  let p = 0;
  if (m.length_us && m.position_us && m.position_us <= m.length_us * 1.1)
    p = (m.position_us / m.length_us) * 100;
  width('track-progress', p);
  set(
    'track-time',
    m.length_us ? `${mmss(m.position_us)} / ${mmss(m.length_us)}` : '—',
  );
  const procs = (x.top_processes || [])
    .filter((p) => p.name !== 'ps')
    .slice(0, 5);
  $('process-list').innerHTML = procs.length
    ? procs
        .map(
          (p) =>
            `<div class="tv-proc"><b>${String(p.name).replace(/[<>&]/g, '')}</b> <span>${Number(p.cpu).toFixed(0)}% cpu · ${Number(p.memory).toFixed(1)}% ram</span></div>`,
        )
        .join('')
    : '—';
  set(
    'last-update',
    `updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
  );
}
async function poll() {
  try {
    const r = await fetch(`${API}/v1/status`, { cache: 'no-store' });
    if (!r.ok) throw 0;
    render(await r.json());
  } catch {
    $('dashboard').hidden = true;
    $('offline').hidden = false;
    $('local-link').classList.add('is-offline');
  }
}
poll();
setInterval(poll, 2000);
