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

export async function readOrIncrementVisitors(request, database) {
  await ensureVisitorCounter(database);

  const eligible = isSameOriginRequest(request);
  const alreadyCounted = !eligible
    || hasCookie(request, visitorCookie)
    || hasCookie(request, ownerCookie);
  const statement = alreadyCounted
    ? database.prepare('SELECT value FROM visitor_counter WHERE id = 1')
    : database.prepare('UPDATE visitor_counter SET value = value + 1 WHERE id = 1 RETURNING value');
  const row = await statement.first();

  return {
    count: Number.isSafeInteger(row?.value) ? row.value : Number.parseInt(row?.value || '0', 10),
    setVisitorCookie: eligible && !alreadyCounted,
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
