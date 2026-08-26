export async function collectYami(date) {
  const template = process.env.YAMI_DAY_URL;
  if (!template) return { gaming: [], watching: [] };
  const url = template.replaceAll('{date}', encodeURIComponent(date));
  const headers = { Accept: 'application/json' };
  if (process.env.YAMI_TOKEN) headers.Authorization = `Bearer ${process.env.YAMI_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Yami returned ${response.status}`);
  const data = await response.json();
  return {
    gaming: Array.isArray(data.gaming) ? data.gaming : [],
    watching: Array.isArray(data.watching) ? data.watching : [],
  };
}
