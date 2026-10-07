import { bearerToken, json, tokenMatches } from '../_lib/http.js';
import { decrementVisitorCount } from '../_lib/visitors.js';

async function notifyCorrection(context, before, after) {
  const url = context.env.NTFY_VISITOR_URL;
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Title: 'somedott.space',
        Priority: 'low',
        Tags: 'wastebasket',
      },
      body: `Visitor removed · ${before} → ${after}`,
    });
    if (!response.ok) {
      console.error('Could not send visitor correction notification', response.status, await response.text());
    }
  } catch (error) {
    console.error('Could not send visitor correction notification', error);
  }
}

export async function onRequestPost(context) {
  if (!tokenMatches(bearerToken(context.request), context.env.PRESENCE_ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!context.env.SITE_DB) return json({ error: 'Visitor storage is not configured' }, { status: 503 });

  try {
    const row = await context.env.SITE_DB.prepare('SELECT value FROM visitor_counter WHERE id = 1').first();
    const before = Number.parseInt(row?.value || '0', 10);
    const visitors = await decrementVisitorCount(context.env.SITE_DB);
    if (visitors < before) context.waitUntil(notifyCorrection(context, before, visitors));
    return json({ ok: true, visitors });
  } catch (error) {
    console.error('Could not decrement visitor counter', error);
    return json({ error: 'Could not decrement visitor counter' }, { status: 500 });
  }
}

export function onRequest() {
  return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
}
