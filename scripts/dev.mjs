import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { watch } from 'node:fs';
import { build, outputDirectory, projectRoot } from './build.mjs';

const port = Number.parseInt(process.env.PORT || '8788', 10);
const rebuildDebounceMs = 300;
const liveReloadClients = new Set();
let rebuildTimer;
let buildInProgress = false;
let rebuildRequested = false;

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const ignoredWatchRoots = new Set([
  '.git',
  'dist',
  'node_modules',
  'scripts',
  'tests',
  'LOCAL_DEVELOPMENT.md',
]);

function isIgnoredWatchPath(filename) {
  if (!filename) return true;
  return ignoredWatchRoots.has(filename.split(path.sep)[0]);
}

function injectLiveReload(html) {
  const script = `<script>
    new EventSource('/__dev/events').addEventListener('reload', function () {
      location.reload();
    });
  </script>`;
  return html.includes('</body>')
    ? html.replace('</body>', `${script}\n</body>`)
    : `${html}\n${script}`;
}

async function findStaticFile(urlPathname) {
  const decodedPath = decodeURIComponent(urlPathname);
  const relativePath = decodedPath.replace(/^\/+/, '');
  const normalizedPath = path.normalize(relativePath);

  if (
    normalizedPath === '..' ||
    normalizedPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(normalizedPath)
  ) {
    return null;
  }

  const requestedPath = path.join(outputDirectory, normalizedPath);
  const candidates = decodedPath.endsWith('/')
    ? [path.join(requestedPath, 'index.html')]
    : [
        requestedPath,
        `${requestedPath}.html`,
        path.join(requestedPath, 'index.html'),
      ];

  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next static routing candidate.
    }
  }

  return null;
}

async function serveRequest(request, response) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host}`);

  if (requestUrl.pathname === '/api/site') {
    if (request.method !== 'POST') {
      response.writeHead(405, {
        Allow: 'POST',
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({
      presence: {
        status: 'offline',
        device: 'PC',
        lastSeen: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
      visitors: 0,
    }));
    return;
  }

  if (requestUrl.pathname === '/__dev/events') {
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
    });
    response.write('retry: 500\n\n');
    liveReloadClients.add(response);
    request.on('close', () => liveReloadClients.delete(response));
    return;
  }

  let filePath;
  try {
    filePath = await findStaticFile(requestUrl.pathname);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }

  if (!filePath) {
    try {
      const notFoundHtml = await readFile(
        path.join(outputDirectory, '404.html'),
        'utf8',
      );
      response.writeHead(404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      });
      response.end(injectLiveReload(notFoundHtml));
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    }
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes.get(extension) || 'application/octet-stream';

  if (extension === '.html') {
    const html = await readFile(filePath, 'utf8');
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
    });
    response.end(injectLiveReload(html));
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  createReadStream(filePath).pipe(response);
}

function notifyLiveReload() {
  for (const client of liveReloadClients) {
    client.write('event: reload\ndata: rebuilt\n\n');
  }
}

async function rebuild() {
  if (buildInProgress) {
    rebuildRequested = true;
    return;
  }

  buildInProgress = true;
  try {
    await build({ production: false });
    notifyLiveReload();
  } catch (error) {
    console.error('Build failed; keeping the dev server running.');
    console.error(error);
  } finally {
    buildInProgress = false;
    if (rebuildRequested) {
      rebuildRequested = false;
      await rebuild();
    }
  }
}

function scheduleRebuild(filename) {
  if (isIgnoredWatchPath(filename)) return;
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, rebuildDebounceMs);
}

await build({ production: false });

const server = createServer((request, response) => {
  serveRequest(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    response.end('Internal server error');
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local site: http://127.0.0.1:${port}`);
  console.log('Watching for changes. Press Ctrl+C to stop.');
});

const watcher = watch(projectRoot, { recursive: true }, (eventType, filename) => {
  scheduleRebuild(filename);
});

function shutDown() {
  watcher.close();
  for (const client of liveReloadClients) client.end();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
