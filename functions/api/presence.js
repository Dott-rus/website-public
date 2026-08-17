import { bearerToken, json, readJson, tokenMatches } from '../_lib/http.js';
import { isPresenceState, presenceDevices } from '../_lib/presence.js';

export async function onRequestPost(context) {
  if (!context.env.PRESENCE) return json({ error: 'Presence storage is not configured' }, { status: 503 });

  const token = bearerToken(context.request);
  const device = presenceDevices.find((candidate) =>
    tokenMatches(token, context.env[candidate.tokenName]));
  if (!device) return json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await readJson(context.request, 1024);
  } catch (error) {
    return json({ error: error.message }, { status: 400 });
  }
  if (!isPresenceState(body.state)) {
    return json({ error: 'state must be online, away, or offline' }, { status: 400 });
  }

  const record = {
    device: device.id,
    state: body.state,
    updatedAt: new Date().toISOString(),
  };
  await context.env.PRESENCE.put(`presence:device:${device.id}`, JSON.stringify(record));
  return json({ ok: true, ...record, deviceLabel: device.label });
}

export function onRequest() {
  return json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } });
}
