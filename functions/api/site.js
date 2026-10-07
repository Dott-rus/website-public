import { json } from '../_lib/http.js';
import { readPresence } from '../_lib/presence.js';
import { readOrIncrementVisitors, visitorCookieHeader } from '../_lib/visitors.js';

function visitorDetails(request) {
  const cf = request.cf || {};
  const location = [cf.city, cf.region, cf.country].filter(Boolean).join(', ') || 'Unknown location';
  const network = [cf.asn ? `AS${cf.asn}` : null, cf.asOrganization].filter(Boolean).join(' · ') || 'Unknown network';
  const colo = cf.colo ? `Cloudflare ${cf.colo}` : null;
  const userAgent = request.headers.get('User-Agent') || 'Unknown user agent';
  const referrer = request.headers.get('Referer') || 'Direct / unknown referrer';
  const ip = request.headers.get('CF-Connecting-IP');
  const maskedIp = ip ? maskIp(ip) : null;

  return [
    `📍 ${location}`,
    `🌐 ${network}${colo ? ` · ${colo}` : ''}`,
    `🧭 ${userAgent}`,
    `↩ ${referrer}`,
    maskedIp ? `IP ${maskedIp}` : null,
  ].filter(Boolean).join('\n');
}

function maskIp(ip) {
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 3).join(':')}::/48`;
  }
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : 'masked';
}

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
        Actions: 'broadcast, -1 visitor, extras.cmd=visitor_decrement, clear=true',
      },
      body: `New visitor · ${count}\n${visitorDetails(context.request)}`,
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
