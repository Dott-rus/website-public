const visitorCookie = 'dott_visitor=v1';
const ownerCookie = 'dott_owner=v1';
const cookieAttributes = 'Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax';

async function ensureVisitorCounter(database) {
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS visitor_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      value INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  await database.prepare(
    'INSERT OR IGNORE INTO visitor_counter (id, value) VALUES (1, 0)',
  ).run();
}

export function hasCookie(request, expected) {
  return (request.headers.get('Cookie') || '')
    .split(';')
    .some((part) => part.trim() === expected);
}

export function visitorCookieHeader() {
  return `${visitorCookie}; ${cookieAttributes}`;
}

export function ownerCookieHeaders() {
  return [
    `${ownerCookie}; ${cookieAttributes}`,
    `${visitorCookie}; ${cookieAttributes}`,
  ];
}

export function isSameOriginRequest(request) {
  const origin = request.headers.get('Origin');
  return request.method === 'POST' && origin === new URL(request.url).origin;
}

// A cookie-less client must not be able to increment the counter on every request.
// Store only a salted hash of the IP + user agent, never the raw IP address.
async function visitorFingerprint(request, secret) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !secret) return null;
  const agent = request.headers.get('User-Agent') || '';
  const data = new TextEncoder().encode(`${secret}\0${ip}\0${agent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readOrIncrementVisitors(request, database, secret) {
  await ensureVisitorCounter(database);
  const eligible = isSameOriginRequest(request);
  const alreadyCounted = !eligible || hasCookie(request, visitorCookie) || hasCookie(request, ownerCookie);
  let newVisitor = false;

  if (!alreadyCounted) {
    const fingerprint = await visitorFingerprint(request, secret);
    if (fingerprint) {
      await database.prepare(`CREATE TABLE IF NOT EXISTS visitor_fingerprints (
        fingerprint TEXT PRIMARY KEY,
        last_seen INTEGER NOT NULL
      )`).run();
      // A visitor is unique within 30 days. The conditional UPSERT is atomic,
      // so simultaneous requests cannot both claim the same visitor.
      const now = Math.floor(Date.now() / 1000);
      const result = await database.prepare(`INSERT INTO visitor_fingerprints (fingerprint, last_seen)
        VALUES (?, ?) ON CONFLICT(fingerprint) DO UPDATE SET last_seen = excluded.last_seen
        WHERE visitor_fingerprints.last_seen < excluded.last_seen - 2592000`)
        .bind(fingerprint, now).run();
      newVisitor = result.meta?.changes === 1;
    } else {
      // Fail closed: without a trustworthy client address and a secret,
      // do not allow unlimited cookie-less increments.
      newVisitor = false;
    }
  }

  const statement = newVisitor
    ? database.prepare('UPDATE visitor_counter SET value = value + 1 WHERE id = 1 RETURNING value')
    : database.prepare('SELECT value FROM visitor_counter WHERE id = 1');
  const row = await statement.first();
  return {
    count: Number.isSafeInteger(row?.value) ? row.value : Number.parseInt(row?.value || '0', 10),
    setVisitorCookie: eligible && !alreadyCounted,
    newVisitor,
  };
}

export async function removeOwnerFromVisitorCount(request, database) {
  const wasVisitor = hasCookie(request, visitorCookie);
  const wasOwner = hasCookie(request, ownerCookie);
  if (!wasVisitor || wasOwner) return false;

  await ensureVisitorCounter(database);
  await database.prepare(
    'UPDATE visitor_counter SET value = MAX(value - 1, 0) WHERE id = 1',
  ).run();
  return true;
}

export async function decrementVisitorCount(database) {
  await ensureVisitorCounter(database);
  const row = await database.prepare(
    'UPDATE visitor_counter SET value = MAX(value - 1, 0) WHERE id = 1 RETURNING value',
  ).first();
  return Number.isSafeInteger(row?.value) ? row.value : Number.parseInt(row?.value || '0', 10);
}
