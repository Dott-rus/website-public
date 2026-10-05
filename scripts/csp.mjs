import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RUNTIME_SOURCES = {
  img: [
    'https://image.tmdb.org',
    'https://shikimori.one',
    'https://coverartarchive.org',
    'https://images.igdb.com',
    'https://megaphone.imgix.net',
  ],
  connect: [
    'https://api.listenbrainz.org',
    'https://yume.somedott.space',
    'https://mood.somedott.space',
  ],
};

function originOf(value) {
  if (!value || !/^https?:\/\//i.test(value)) return '';
  try { return new URL(value).origin; } catch { return ''; }
}

function addOrigin(set, value) {
  const origin = originOf(value);
  if (origin) set.add(origin);
}

function attrs(tag) {
  const result = new Map();
  for (const match of tag.matchAll(/\b([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    result.set(match[1].toLowerCase(), match[3]);
  }
  return result;
}

async function filesUnder(root) {
  const result = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.push(full);
    }
  }
  await walk(root);
  return result;
}

export async function generateCspHeaders(outputDirectory) {
  const sources = {
    img: new Set(RUNTIME_SOURCES.img),
    connect: new Set(RUNTIME_SOURCES.connect),
    script: new Set(),
    style: new Set(),
    font: new Set(),
    frame: new Set(),
    media: new Set(),
  };

  const files = await filesUnder(outputDirectory);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!['.html', '.js', '.css'].includes(ext)) continue;
    const text = await readFile(file, 'utf8');

    if (ext === '.html') {
      for (const match of text.matchAll(/<(img|script|link|iframe|audio|video|source)\b[^>]*>/gi)) {
        const tagName = match[1].toLowerCase();
        const a = attrs(match[0]);
        if (tagName === 'img') addOrigin(sources.img, a.get('src'));
        else if (tagName === 'script') {
          const src = a.get('src');
          addOrigin(sources.script, src);
          // Third-party widgets commonly fetch JSON from the same origin at runtime.
          addOrigin(sources.connect, src);
        }
        else if (tagName === 'iframe') addOrigin(sources.frame, a.get('src'));
        else if (['audio', 'video', 'source'].includes(tagName)) addOrigin(sources.media, a.get('src'));
        else if (tagName === 'link') {
          const rel = (a.get('rel') || '').toLowerCase().split(/\s+/);
          if (rel.includes('stylesheet')) addOrigin(sources.style, a.get('href'));
          if (rel.includes('preconnect')) {
            const href = a.get('href') || '';
            if (/fonts\.gstatic\.com/i.test(href)) addOrigin(sources.font, href);
          }
        }
      }
    }

    if (ext === '.css') {
      for (const match of text.matchAll(/url\(\s*(["']?)(https?:\/\/[^)'"\s]+)\1\s*\)/gi)) {
        const url = match[2];
        if (/fonts\.(gstatic|googleapis)\.com/i.test(url)) addOrigin(sources.font, url);
        else addOrigin(sources.img, url);
      }
      for (const match of text.matchAll(/@import\s+(?:url\()?\s*(["'])(https?:\/\/.*?)\1/gi)) {
        addOrigin(sources.style, match[2]);
      }
    }

    if (ext === '.js') {
      for (const match of text.matchAll(/(?:fetch|EventSource|WebSocket)\s*\(\s*([`"'])(https?:\/\/[^`"']+)/gi)) {
        addOrigin(sources.connect, match[2]);
      }
    }
  }

  const directive = (name, base, set) => `${name} ${[...base, ...[...set].sort()].join(' ')}`;
  const policy = [
    `default-src 'self'`,
    directive('script-src', ["'self'", "'unsafe-inline'"], sources.script),
    directive('style-src', ["'self'", "'unsafe-inline'"], sources.style),
    directive('img-src', ["'self'", 'data:', 'blob:'], sources.img),
    directive('connect-src', ["'self'"], sources.connect),
    directive('font-src', ["'self'", 'data:'], sources.font),
    directive('frame-src', ["'self'"], sources.frame),
    directive('media-src', ["'self'", 'blob:'], sources.media),
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');

  const headers = `/*\n  Content-Security-Policy: ${policy}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`;
  await writeFile(path.join(outputDirectory, '_headers'), headers);
  return { policy, sources };
}
