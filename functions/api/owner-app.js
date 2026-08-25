import { OWNER_APP_SOURCE } from '../_private/owner-app-source.js';

const MIRA_USER_ENDPOINT = 'https://mira.somedott.space/api/v1/user';

function suppliedToken(request) {
  const value = request.headers.get('Authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function onRequestGet(context) {
  const token = suppliedToken(context.request);
  if (!token) return new Response('Not found', { status: 404 });
  try {
    const response = await fetch(MIRA_USER_ENDPOINT, {
      headers: { Accept: 'application/json', Authorization: `token ${token}` },
    });
    if (!response.ok) return new Response('Not found', { status: 404 });
    const user = await response.json();
    if ((user.login || user.username) !== 'Dott') return new Response('Not found', { status: 404 });
  } catch {
    return new Response('Not found', { status: 404 });
  }
  return new Response(OWNER_APP_SOURCE, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Vary': 'Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function onRequest() {
  return new Response('Not found', { status: 404 });
}
