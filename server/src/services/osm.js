// OpenStreetMap services: Nominatim (geocoding) + Overpass (points of interest).
// Both are free and keyless; please respect their usage policies (see README).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
// Attractions now come from Wikipedia (fast, ranked by popularity – see attractions.js); the
// Overpass query only fetches amenities, which keeps it light. OSM attractions remain a fallback.
export const AMENITY_KINDS = ['food', 'toilets', 'parking'];
export const BUCKETS = [1000, 2000, 5000, 10000, 20000];
// Food, washrooms and parking are only useful within walking/short-drive distance, so their radius is
// capped. Smaller areas also make the query much faster in dense cities (work grows with area).
export const CAPS = { attractions: 20000, food: 3000, toilets: 2000, parking: 3000 };
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

/** One combined query for several kinds (default: the three amenity kinds). */
function buildQuery(lat, lon, radius, kinds = AMENITY_KINDS) {
  const around = (k) => `around:${Math.min(radius, CAPS[k])},${lat},${lon}`;
  // `qt` skips sorting the output by ID (faster); a short server-side timeout fails fast so we can
  // fall back to another mirror instead of waiting.
  return (
    `[out:json][timeout:25];` +
    kinds.map((k, i) => `(${QUERIES[k](around(k))})->.s${i};.s${i} out center tags qt ${LIMITS[k]};`).join('')
  );
}

// Mirrors that just failed are skipped for a while so we don't keep hammering them.
const mirrorCooldown = new Map();

// Remember which mirror answered fastest recently and try it first.
const mirrorSpeed = new Map(); // url -> smoothed response time (ms)
const HEDGE_AFTER_MS = 4000; // if no answer yet, also ask the next mirror

async function askMirror(url, body, signal) {
  const started = Date.now();
  const data = await overpassLimit(() =>
    fetchJson(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      ttl: 0, // cached per area below
      timeout: 30_000,
      signal,
    }),
  );
  // Overpass reports timeouts / memory limits inside a 200 response.
  if (data.remark && /runtime error|timed out|out of memory|rate_limited/i.test(data.remark) && !(data.elements || []).length) {
    throw Object.assign(new Error(`Overpass: ${data.remark}`), { status: 504 });
  }
  const took = Date.now() - started;
  mirrorSpeed.set(url, mirrorSpeed.has(url) ? mirrorSpeed.get(url) * 0.6 + took * 0.4 : took);
  return data;
}

/**
 * "Hedged" request: ask the best mirror; if it hasn't answered within a few seconds, also ask the
 * next one, and so on. The first good answer wins and the others are cancelled.
 */
async function overpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  const all = OVERPASS_MIRRORS();
  const ready = all.filter((m) => (mirrorCooldown.get(m) || 0) < Date.now());
  const order = (ready.length ? ready : all).sort((a, b) => (mirrorSpeed.get(a) ?? 9e9) - (mirrorSpeed.get(b) ?? 9e9));
  const ctrl = new AbortController();

  return new Promise((resolve, reject) => {
    let next = 0;
    let pending = 0;
    let done = false;
    let lastErr;
    let hedgeTimer;

    const launch = () => {
      if (done || next >= order.length) return;
      const url = order[next++];
      pending++;
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, HEDGE_AFTER_MS);
      askMirror(url, body, ctrl.signal).then(
        (data) => {
          if (done) return;
          done = true;
          clearTimeout(hedgeTimer);
          mirrorCooldown.delete(url);
          ctrl.abort(); // cancel the slower ones
          resolve(data);
        },
        (e) => {
          pending--;
          if (done) return;
          lastErr = e;
          if (e.name !== 'AbortError') {
            mirrorCooldown.set(url, Date.now() + (e.status === 429 ? 90_000 : 45_000));
            console.warn(`[overpass] ${url} failed (${e.status || e.name}: ${e.message})`);
          }
          if (next < order.length) launch(); // failed fast → try the next one right away
          else if (pending === 0) {
            done = true;
            clearTimeout(hedgeTimer);
            reject(lastErr || new Error('Overpass unavailable'));
          }
        },
      );
    };
    launch();
  });
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

// Saved to disk so popular places stay instant after a restart (most recent areas only).
const CACHE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/area-cache.json');
const PERSIST_MAX = 80;
try {
  for (const [k, list] of JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))) areaCache.set(k, list);
  console.log(`[overpass] loaded ${areaCache.size} saved areas`);
} catch {
  /* first run */
}
let saveTimer;
export function persistAreaCache() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(`${CACHE_FILE}.tmp`, JSON.stringify([...areaCache.entries()].slice(-PERSIST_MAX)));
      fs.renameSync(`${CACHE_FILE}.tmp`, CACHE_FILE);
    } catch (e) {
      console.warn('[overpass] could not save cache:', e.message);
    }
  }, 2000);
}

/** True when this spot already has fresh results covering `radius`. */
export function hasFreshArea(lat, lon, radius) {
  const list = areaCache.get(`${round4(lat)},${round4(lon)}`) || [];
  return list.some((e) => e.radius >= radius && Date.now() - e.at < FRESH_MS);
}

const round4 = (n) => Math.round(n * 1e4) / 1e4;
export const bucketFor = (r) => BUCKETS.find((b) => b >= r) ?? BUCKETS[BUCKETS.length - 1];

function filterTo(data, radius) {
  const res = {};
  for (const k of AMENITY_KINDS) {
    const r = Math.min(radius, CAPS[k]);
    res[k] = (data[k] || []).filter((p) => p.distance <= r);
  }
  return res;
}

/**
 * Restaurants, washrooms and parking around a point (one Overpass request, cached per area).
 * Returns { center, radius, stale, food, toilets, parking } – each a list sorted nearest first.
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
          areaCache.delete(key); // keep most-recent order for the saved file
          areaCache.set(key, list);
          if (areaCache.size > 500) areaCache.delete(areaCache.keys().next().value);
          persistAreaCache();
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

/** Single-kind helper for older clients (amenities only; attractions come from attractions.js). */
export async function nearby(lat, lon, radius, kind) {
  if (!AMENITY_KINDS.includes(kind)) throw Object.assign(new Error(`Unknown kind "${kind}"`), { status: 400, expose: true });
  const all = await nearbyAll(lat, lon, radius);
  return { kind, radius, center: all.center, count: all[kind].length, items: all[kind] };
}

// ---- OSM attractions: fallback for places Wikipedia covers poorly (cached per area) ----
const osmAttrCache = new Map();
export async function osmAttractions(lat, lon, radius) {
  lat = round4(lat);
  lon = round4(lon);
  const key = `${lat},${lon},${bucketFor(radius)}`;
  const hit = osmAttrCache.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.items;
  const raw = await overpass(buildQuery(lat, lon, bucketFor(radius), ['attractions']));
  const items = organise(raw.elements || [], lat, lon).attractions;
  osmAttrCache.set(key, { at: Date.now(), items });
  if (osmAttrCache.size > 300) osmAttrCache.delete(osmAttrCache.keys().next().value);
  return items;
}

/**
 * Warm the cache for popular places in the background, one at a time and politely spaced,
 * so their pages open instantly. `after(point)` can do extra work (e.g. photos).
 */
export async function prewarm(points, radius = 5000, { gapMs = 5000, after } = {}) {
  let warmed = 0;
  for (const p of points) {
    if (hasFreshArea(p.lat, p.lon, radius)) continue;
    try {
      await nearbyAll(p.lat, p.lon, radius);
      if (after) await after(p);
      warmed++;
    } catch (e) {
      console.warn(`[prewarm] ${p.name || `${p.lat},${p.lon}`}: ${e.message}`);
    }
    await sleep(gapMs);
  }
  return warmed;
}
