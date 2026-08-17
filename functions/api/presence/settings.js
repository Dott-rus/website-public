import { bearerToken, json, readJson, tokenMatches } from '../../_lib/http.js';
import { normalizePresenceSettings } from '../../_lib/presence.js';

export async function onRequestPost(context) {
  if (!context.env.PRESENCE) return json({ error: 'Presence storage is not configured' }, { status: 503 });
  if (!tokenMatches(bearerToken(context.request), context.env.PRESENCE_ADMIN_TOKEN)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await readJson(context.request, 1024);
  } catch (error) {
    return json({ error: error.message }, { status: 400 });
  }

  if (typeof body.invisible !== 'boolean' && typeof body.showDevice !== 'boolean') {
    return json({ error: 'Provide invisible and/or showDevice as booleans' }, { status: 400 });
  }

  const current = normalizePresenceSettings(
    await context.env.PRESENCE.get('presence:settings', { type: 'json' }),
  );
  const settings = {
    invisible: typeof body.invisible === 'boolean' ? body.invisible : current.invisible,
    showDevice: typeof body.showDevice === 'boolean' ? body.showDevice : current.showDevice,
  };
  await context.env.PRESENCE.put('presence:settings', JSON.stringify(settings));
  return json({ ok: true, settings });
}

export function onRequest() {
  return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
}
