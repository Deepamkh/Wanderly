const BASE = import.meta.env.VITE_API_URL || '';

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const api = {
  pins: () => req('/api/cities/pins'),
  topCities: () => req('/api/cities/top'),
  destinations: () => req('/api/destinations'),
  search: (q, signal) => req(`/api/places/search?${qs({ q })}`, { signal }),
  details: (params) => req(`/api/places/details?${qs(params)}`),
  nearby: (lat, lon, radius, kind) => req(`/api/places/nearby?${qs({ lat, lon, radius, kind })}`),
  reviews: (key) => req(`/api/reviews/${encodeURIComponent(key)}`),
  addReview: (key, body) => req(`/api/reviews/${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify(body) }),
  helpful: (key, id) => req(`/api/reviews/${encodeURIComponent(key)}/${id}/helpful`, { method: 'POST' }),
  plan: (body) => req('/api/planner', { method: 'POST', body: JSON.stringify(body) }),
};

export const slugify = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'place';

export const fmtDist = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
export const walkMins = (m) => Math.max(1, Math.round(m / 80));
export const titleCase = (s) => String(s || '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function exploreUrl(p) {
  const params = { q: p.name };
  if (p.lat != null && p.lon != null) Object.assign(params, { lat: p.lat, lon: p.lon });
  if (p.wikipedia) params.wiki = p.wikipedia;
  if (p.wikidata) params.wikidata = p.wikidata;
  if (p.city) params.city = p.city;
  if (p.isArea) params.area = '1';
  return `/explore?${qs(params)}`;
}

export const directionsUrl = (from, to) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from.lat},${from.lon};${to.lat},${to.lon}`;
