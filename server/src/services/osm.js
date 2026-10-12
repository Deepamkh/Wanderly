// OpenStreetMap services: Nominatim (geocoding) + Overpass (points of interest).
// Both are free and keyless; please respect their usage policies (see README).
import { fetchJson, haversine, createRateGate, createLimiter, sleep } from '../utils/http.js';

const NOMINATIM = () => process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

// Public Overpass instances, tried in order. Override with OVERPASS_URLS (comma-separated),
// e.g. to point at your own instance first.
const DEFAULT_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OVERPASS_MIRRORS = () =>
  (process.env.OVERPASS_URLS ? process.env.OVERPASS_URLS.split(',') : DEFAULT_MIRRORS).map((s) => s.trim()).filter(Boolean);

const nominatimGate = createRateGate(1100); // max ~1 request/second
const overpassLimit = createLimiter(2); // Overpass gives each IP ~2 slots

const AREA_TYPES = new Set([
  'city', 'town', 'village', 'state', 'country', 'county', 'municipality', 'region',
  'province', 'district', 'island', 'archipelago', 'city_district', 'suburb', 'borough',
]);

function mapNominatim(r) {
  const a = r.address || {};
  const name = r.namedetails?.['name:en'] || r.name || r.display_name.split(',')[0];
  const city = a.city || a.town || a.village || a.municipality || a.state || null;
  return {
    id: `${r.osm_type}/${r.osm_id}`,
    name,
    displayName: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    category: r.category,
    type: r.type,
    addressType: r.addresstype,
    country: a.country || null,
    city: city && city !== name ? city : null,
    wikipedia: r.extratags?.wikipedia || null,
    wikidata: r.extratags?.wikidata || null,
    isArea: AREA_TYPES.has(r.addresstype) || r.category === 'boundary' || (r.category === 'place' && AREA_TYPES.has(r.type)),
    importance: r.importance ?? 0,
  };
}

export async function geocode(q, limit = 6) {
  const url =
    `${NOMINATIM()}/search?format=jsonv2&addressdetails=1&extratags=1&namedetails=1` +
    `&accept-language=en&limit=${limit}&q=${encodeURIComponent(q)}`;
  const data = await fetchJson(url, { ttl: 24 * 3_600_000, beforeNetwork: nominatimGate });
  return data.map(mapNominatim);
}

// ---------------- Overpass ----------------

export const KINDS = ['attractions', 'food', 'toilets', 'parking'];
export const BUCKETS = [1000, 2000, 5000, 10000, 20000];
// Food, washrooms and parking are only useful close by, so their radius is capped.
export const CAPS = { attractions: 20000, food: 5000, toilets: 3000, parking: 5000 };
const LIMITS = { attractions: 500, food: 700, toilets: 300, parking: 350 };
const KEEP = { attractions: 120, food: 300, toilets: 120, parking: 120 };

const QUERIES = {
  attractions: (a) => `
    nwr["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"]["name"](${a});
    nwr["historic"~"^(monument|castle|memorial|ruins|archaeological_site|fort|palace|city_gate)$"]["name"](${a});
    nwr["leisure"~"^(park|garden|nature_reserve)$"]["name"]["wikipedia"](${a});
    nwr["amenity"="place_of_worship"]["name"]["wikipedia"](${a});`,
  food: (a) => `nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|pub|bar|ice_cream)$"]["name"](${a});`,
  toilets: (a) => `nwr["amenity"="toilets"](${a});`,
  parking: (a) => `nwr["amenity"~"^(parking|motorcycle_parking)$"](${a});`,
};

const FOOD_AMENITIES = new Set(['restaurant', 'cafe', 'fast_food', 'food_court', 'pub', 'bar', 'ice_cream']);

function classify(tags = {}) {
  if (tags.amenity === 'toilets') return 'toilets';
  if (tags.amenity === 'parking' || tags.amenity === 'motorcycle_parking') return 'parking';
  if (FOOD_AMENITIES.has(tags.amenity)) return 'food';
  return 'attractions';
}

/** One combined query for all four kinds – a quarter of the load on the free servers. */
function buildQuery(lat, lon, radius) {
  const around = (k) => `around:${Math.min(radius, CAPS[k])},${lat},${lon}`;
  return (
    `[out:json][timeout:60];` +
    KINDS.map((k, i) => `(${QUERIES[k](around(k))})->.s${i};.s${i} out center tags ${LIMITS[k]};`).join('')
  );
}

// Mirrors that just failed are skipped for a while so we don't keep hammering them.
const mirrorCooldown = new Map();

async function overpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  const mirrors = OVERPASS_MIRRORS();
  const ready = mirrors.filter((m) => (mirrorCooldown.get(m) || 0) < Date.now());
  const order = ready.length ? ready : mirrors;
  let lastErr;
  for (const [i, url] of order.entries()) {
    try {
      const data = await overpassLimit(() =>
        fetchJson(url, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          ttl: 0, // cached below, per area
          timeout: 65_000,
        }),
      );
      // Overpass reports timeouts / memory limits inside a 200 response.
      if (data.remark && /runtime error|timed out|out of memory|rate_limited/i.test(data.remark) && !(data.elements || []).length) {
        throw Object.assign(new Error(`Overpass: ${data.remark}`), { status: 504 });
      }
      mirrorCooldown.delete(url);
      return data;
    } catch (e) {
      lastErr = e;
      mirrorCooldown.set(url, Date.now() + (e.status === 429 ? 90_000 : 45_000));
      console.warn(`[overpass] ${url} failed (${e.status || e.name}: ${e.message})`);
      if (i < order.length - 1) await sleep(600 * (i + 1));
    }
  }
  throw lastErr || new Error('Overpass unavailable');
}

const yes = (v) => v === 'yes' || v === 'only';

function shape(kind, el, lat, lon) {
  const c = el.type === 'node' ? { lat: el.lat, lon: el.lon } : el.center;
  if (!c) return null;
  const t = el.tags || {};
  const base = {
    id: `${el.type}/${el.id}`,
    name: t['name:en'] || t.name || null,
    lat: c.lat,
    lon: c.lon,
    distance: Math.round(haversine(lat, lon, c.lat, c.lon)),
    openingHours: t.opening_hours || null,
    wheelchair: t.wheelchair || null,
  };
  switch (kind) {
    case 'attractions':
      return {
        ...base,
        category: t.tourism || t.historic || t.leisure || (t.amenity === 'place_of_worship' ? 'place of worship' : t.amenity) || 'attraction',
        wikipedia: t.wikipedia || null,
        wikidata: t.wikidata || null,
        website: t.website || t['contact:website'] || null,
        fee: t.fee || null,
        description: t.description || null,
      };
    case 'food':
      return {
        ...base,
        kind: t.amenity,
        cuisines: (t.cuisine || '')
          .split(/[;,]/)
          .map((s) => s.trim().toLowerCase().replace(/_/g, ' '))
          .filter(Boolean),
        vegetarian: yes(t['diet:vegetarian']),
        vegan: yes(t['diet:vegan']),
        website: t.website || t['contact:website'] || null,
        phone: t.phone || t['contact:phone'] || null,
        address: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || null,
      };
    case 'toilets':
      if (['private', 'no'].includes(t.access)) return null;
      return {
        ...base,
        name: base.name || 'Public washroom',
        fee: t.fee || null,
        changingTable: yes(t.changing_table),
        unisex: yes(t.unisex),
        access: t.access || null,
      };
    case 'parking':
      if (['private', 'no'].includes(t.access)) return null;
      return {
        ...base,
        name: base.name || (t.amenity === 'motorcycle_parking' ? 'Motorcycle parking' : 'Parking'),
        parkingType: t.parking || (t.amenity === 'motorcycle_parking' ? 'motorcycle' : null),
        fee: t.fee || null,
        capacity: t.capacity ? Number(t.capacity) || t.capacity : null,
        access: t.access || null,
      };
    default:
      return base;
  }
}

function attractionScore(p) {
  // Favour well-documented places, then proximity.
  let s = 0;
  if (p.wikipedia) s += 3;
  if (p.wikidata) s += 1;
  if (['attraction', 'museum', 'castle', 'palace', 'monument', 'viewpoint'].includes(p.category)) s += 1;
  return s - p.distance / 4000;
}

function organise(elements, lat, lon) {
  const out = { attractions: [], food: [], toilets: [], parking: [] };
  const seenId = new Set();
  const seenName = { attractions: new Set(), food: new Set() };
  for (const el of elements) {
    const key = `${el.type}/${el.id}`;
    if (seenId.has(key)) continue;
    seenId.add(key);
    const kind = classify(el.tags);
    const p = shape(kind, el, lat, lon);
    if (!p) continue;
    if (kind === 'attractions' || kind === 'food') {
      if (!p.name) continue;
      const n = p.name.toLowerCase();
      if (seenName[kind].has(n)) continue; // node/way duplicates of the same place
      seenName[kind].add(n);
    }
    out[kind].push(p);
  }
  out.attractions.sort((a, b) => attractionScore(b) - attractionScore(a));
  for (const k of ['food', 'toilets', 'parking']) out[k].sort((a, b) => a.distance - b.distance);
  for (const k of KINDS) out[k] = out[k].slice(0, KEEP[k]);
  return out;
}

// ---- Per-area cache: one fetch at a radius "bucket" serves every smaller radius around that spot. ----
const FRESH_MS = 12 * 3_600_000;
const areaCache = new Map(); // "lat,lon" -> [{ radius, at, data }]
const inFlight = new Map();

const round4 = (n) => Math.round(n * 1e4) / 1e4;
export const bucketFor = (r) => BUCKETS.find((b) => b >= r) ?? BUCKETS[BUCKETS.length - 1];

function filterTo(data, radius) {
  const res = {};
  for (const k of KINDS) {
    const r = Math.min(radius, CAPS[k]);
    res[k] = data[k].filter((p) => p.distance <= r);
  }
  return res;
}

/**
 * All four kinds of nearby places around a point.
 * Returns { center, radius, stale, attractions, food, toilets, parking } – each a list sorted for display.
 */
export async function nearbyAll(lat, lon, radius) {
  lat = round4(lat);
  lon = round4(lon);
  const key = `${lat},${lon}`;
  const entries = areaCache.get(key) || [];
  const fresh = entries.find((e) => e.radius >= radius && Date.now() - e.at < FRESH_MS);
  if (fresh) return { center: { lat, lon }, radius, stale: false, ...filterTo(fresh.data, radius) };

  const bucket = bucketFor(radius);
  const flightKey = `${key},${bucket}`;
  if (!inFlight.has(flightKey)) {
    inFlight.set(
      flightKey,
      overpass(buildQuery(lat, lon, bucket))
        .then((raw) => {
          const data = organise(raw.elements || [], lat, lon);
          const list = (areaCache.get(key) || []).filter((e) => e.radius > bucket);
          list.push({ radius: bucket, at: Date.now(), data });
          areaCache.set(key, list);
          if (areaCache.size > 500) areaCache.delete(areaCache.keys().next().value);
          return data;
        })
        .finally(() => inFlight.delete(flightKey)),
    );
  }

  try {
    const data = await inFlight.get(flightKey);
    return { center: { lat, lon }, radius, stale: false, ...filterTo(data, radius) };
  } catch (e) {
    // Serve older results for this spot rather than an error, if we have any.
    const old = [...entries].sort((a, b) => b.radius - a.radius)[0];
    if (old) return { center: { lat, lon }, radius: Math.min(radius, old.radius), stale: true, ...filterTo(old.data, radius) };
    throw Object.assign(new Error('Nearby places are busy loading from OpenStreetMap. Retrying shortly…'), { status: 503, expose: true });
  }
}

/** Single-kind helper kept for the planner and older clients. */
export async function nearby(lat, lon, radius, kind) {
  if (!KINDS.includes(kind)) throw Object.assign(new Error(`Unknown kind "${kind}"`), { status: 400, expose: true });
  const all = await nearbyAll(lat, lon, radius);
  return { kind, radius, center: all.center, count: all[kind].length, items: all[kind] };
}
