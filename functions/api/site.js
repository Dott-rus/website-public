import { json } from '../_lib/http.js';
import { readPresence } from '../_lib/presence.js';
import { readOrIncrementVisitors, visitorCookieHeader } from '../_lib/visitors.js';

async function notifyVisitor(context, count) {
  const url = context.env.NTFY_VISITOR_URL;
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Title: 'somedott.space',
        Priority: 'low',
        Tags: 'eyes',
      },
      body: `New visitor · ${count}`,
    });

    if (!response.ok) {
      console.error('Could not send visitor notification', response.status, await response.text());
    }
  } catch (error) {
    console.error('Could not send visitor notification', error);
  }
}

export async function onRequestPost(context) {
  let presence = { status: 'unknown', device: null, lastSeen: null };
  let visitors = null;
  let setVisitorCookie = false;

  if (context.env.PRESENCE) {
    try {
      presence = await readPresence(context.env.PRESENCE);
    } catch (error) {
      console.error('Could not read presence', error);
    }
  }

  if (context.env.SITE_DB) {
    try {
      const result = await readOrIncrementVisitors(context.request, context.env.SITE_DB);
      visitors = result.count;
      setVisitorCookie = result.setVisitorCookie;

      if (setVisitorCookie) {
        context.waitUntil(notifyVisitor(context, visitors));
      }
    } catch (error) {
      console.error('Could not update visitor counter', error);
    }
  }

  const headers = new Headers();
  if (setVisitorCookie) headers.append('Set-Cookie', visitorCookieHeader());
  return json({ presence, visitors }, { headers });
}

export function onRequest() {
  return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
}
