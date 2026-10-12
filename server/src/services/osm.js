// OpenStreetMap services: Nominatim (geocoding) + Overpass (points of interest).
// Both are free and keyless; please respect their usage policies (see README).
import { fetchJson, haversine, createRateGate, createLimiter, sleep } from '../utils/http.js';

const NOMINATIM = () => process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const OVERPASS_MIRRORS = () =>
  (process.env.OVERPASS_URLS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const nominatimGate = createRateGate(1100); // max ~1 request/second
const overpassLimit = createLimiter(2);

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

const LIMITS = { attractions: 400, food: 500, toilets: 200, parking: 250 };
const KEEP = { attractions: 60, food: 160, toilets: 60, parking: 60 };

async function overpass(query) {
  const body = `data=${encodeURIComponent(query)}`;
  let lastErr;
  for (const [i, url] of OVERPASS_MIRRORS().entries()) {
    try {
      return await overpassLimit(() =>
        fetchJson(url, {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          ttl: 6 * 3_600_000,
          timeout: 40_000,
        }),
      );
    } catch (e) {
      lastErr = e;
      if (e.status === 429) await sleep(1200 * (i + 1));
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

export async function nearby(lat, lon, radius, kind) {
  if (!QUERIES[kind]) throw Object.assign(new Error(`Unknown kind "${kind}"`), { status: 400 });
  const around = `around:${radius},${lat},${lon}`;
  const q = `[out:json][timeout:30];(${QUERIES[kind](around)});out center tags ${LIMITS[kind]};`;
  const data = await overpass(q);

  const seen = new Set();
  let items = (data.elements || [])
    .map((el) => shape(kind, el, lat, lon))
    .filter((p) => {
      if (!p) return false;
      if (kind === 'attractions' || kind === 'food') {
        if (!p.name) return false;
        const k = p.name.toLowerCase();
        if (seen.has(k)) return false; // drop node/way duplicates of the same place
        seen.add(k);
      }
      return true;
    });

  if (kind === 'attractions') items.sort((a, b) => attractionScore(b) - attractionScore(a));
  else items.sort((a, b) => a.distance - b.distance);
  items = items.slice(0, KEEP[kind]);

  const result = { kind, radius, center: { lat, lon }, count: items.length, items };
  if (kind === 'food') {
    const counts = {};
    for (const p of items) for (const c of p.cuisines.length ? p.cuisines : ['other']) counts[c] = (counts[c] || 0) + 1;
    result.cuisines = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }
  return result;
}
