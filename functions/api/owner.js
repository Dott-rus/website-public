import { bearerToken, json, tokenMatches } from '../_lib/http.js';
import {
  ownerCookieHeaders,
  removeOwnerFromVisitorCount,
} from '../_lib/visitors.js';

export async function onRequestPost(context) {
  if (!tokenMatches(bearerToken(context.request), context.env.PRESENCE_ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let removedFromCount = false;
  if (context.env.SITE_DB) {
    try {
      removedFromCount = await removeOwnerFromVisitorCount(context.request, context.env.SITE_DB);
    } catch (error) {
      console.error('Could not adjust owner visitor count', error);
    }
  }

  const headers = new Headers();
  for (const cookie of ownerCookieHeaders()) headers.append('Set-Cookie', cookie);
  return json({ ok: true, ownerBrowser: true, removedFromCount }, { headers });
}

export function onRequest() {
  return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
}
