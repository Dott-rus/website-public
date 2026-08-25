import { parse, stringify } from 'yaml';
import { ownerApp } from '../_private/owner-app.js';

const MIRA_USER_ENDPOINT = 'https://mira.somedott.space/api/v1/user';
const MAX_YAML_BYTES = 1024 * 1024;

function suppliedToken(request) {
  const value = request.headers.get('Authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function isOwner(request) {
  const token = suppliedToken(request);
  if (!token) return false;
  try {
    const response = await fetch(MIRA_USER_ENDPOINT, {
      headers: { Accept: 'application/json', Authorization: `token ${token}` },
    });
    if (!response.ok) return false;
    const user = await response.json();
    return String(user.login || user.username || '').toLowerCase() === 'dott';
  } catch {
    return false;
  }
}

function notFound() {
  return new Response('Not found', { status: 404 });
}

export async function onRequestGet(context) {
  if (!(await isOwner(context.request))) return notFound();
  const source = `(${ownerApp.toString()})();`;
  return new Response(source, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'private, max-age=31536000, immutable',
      Vary: 'Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequestPost(context) {
  if (!(await isOwner(context.request))) return notFound();
  const length = Number(context.request.headers.get('Content-Length') || 0);
  if (length > MAX_YAML_BYTES) {
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  }

  try {
    const body = await context.request.json();
    if (body?.operation === 'parse' && typeof body.source === 'string') {
      if (new TextEncoder().encode(body.source).length > MAX_YAML_BYTES) {
        return Response.json({ error: 'Payload too large' }, { status: 413 });
      }
      return Response.json({ value: parse(body.source) });
    }
    if (body?.operation === 'stringify') {
      const source = stringify(body.value, { lineWidth: 0, minContentWidth: 0 });
      if (new TextEncoder().encode(source).length > MAX_YAML_BYTES) {
        return Response.json({ error: 'Payload too large' }, { status: 413 });
      }
      return Response.json({ source });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ error: 'Bad request' }, { status: 400 });
}

export function onRequest() {
  return notFound();
}
