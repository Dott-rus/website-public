export const SITE_TIME_ZONE = process.env.SITE_TIME_ZONE || 'Europe/Moscow';

export function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((out, part) => (out[part.type] = part.value, out), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dayBounds(date) {
  // Vologda/Moscow is UTC+03:00 and has no DST. Keep the offset explicit in baked timestamps.
  const start = new Date(`${date}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 86400000);
  return { start, end, minTs: Math.floor(start.getTime()/1000), maxTs: Math.floor(end.getTime()/1000)-1 };
}
