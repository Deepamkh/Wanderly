// Restaurants, washrooms and parking from the Geoapify Places API (fast, hosted, built on OpenStreetMap data).
// Free plan: 3,000 credits/day, no card. A request costs 1 credit per 20 results returned.
// Set GEOAPIFY_API_KEY in server/.env (or your host's environment). Without it, Overpass is used.
import { fetchJson } from '../utils/http.js';

const BASE = 'https://api.geoapify.com/v2/places';

export const geoapifyKey = () => (process.env.GEOAPIFY_API_KEY || '').trim();

// What we ask for per kind, and how many results (cost ≈ limit / 20 credits each).
const KIND_REQUESTS = {
  food: {
    categories: 'catering.restaurant,catering.cafe,catering.fast_food,catering.food_court,catering.bar,catering.pub,catering.ice_cream,catering.biergarten,catering.taproom',
    limit: 200,
  },
  toilets: { categories: 'amenity.toilet', limit: 60 },
  parking: { categories: 'parking.cars,parking.motorcycle', limit: 60 },
};

const CATERING_TO_AMENITY = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  fast_food: 'fast_food',
  food_court: 'food_court',
  bar: 'bar',
  pub: 'pub',
  biergarten: 'pub',
  taproom: 'bar',
  ice_cream: 'ice_cream',
};
// Category sub-keys that are a style of venue, not a cuisine.
const NOT_CUISINE = new Set(['coffee_shop', 'tea', 'ice_cream', 'bubble_tea', 'dessert', 'cake', 'waffle', 'crepe', 'frozen_yogurt', 'donut']);

const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : undefined);

/**
 * Turn a Geoapify feature into the same shape as an Overpass element ({ type, id, lat, lon, tags }),
 * so it goes through exactly the same processing as OpenStreetMap results.
 * Geoapify passes the original OSM tags in datasource.raw for most places; we fill gaps from its own fields.
 */
export function featureToElement(f) {
  const p = f.properties || {};
  const raw = p.datasource?.raw && typeof p.datasource.raw === 'object' ? p.datasource.raw : {};
  const tags = {};
  for (const [k, v] of Object.entries(raw)) if (v != null && typeof v !== 'object') tags[k] = String(v);

  const cats = Array.isArray(p.categories) ? p.categories : [];
  if (!tags.amenity) {
    if (cats.some((c) => c.startsWith('amenity.toilet'))) tags.amenity = 'toilets';
    else if (cats.includes('parking.motorcycle')) tags.amenity = 'motorcycle_parking';
    else if (cats.some((c) => c.startsWith('parking'))) tags.amenity = 'parking';
    else {
      const sub = cats.map((c) => c.split('.')).find((parts) => parts[0] === 'catering' && CATERING_TO_AMENITY[parts[1]]);
      if (sub) tags.amenity = CATERING_TO_AMENITY[sub[1]];
    }
  }
  if (!tags.parking) {
    const t = cats.find((c) => /^parking\.cars\.(surface|multistorey|underground|rooftop)$/.test(c));
    if (t) tags.parking = t.split('.').pop() === 'multistorey' ? 'multi-storey' : t.split('.').pop();
  }
  if (!tags.cuisine) {
    const fromProps = p.catering?.cuisine;
    const fromCats = cats
      .map((c) => c.split('.'))
      .filter((parts) => parts[0] === 'catering' && parts.length >= 3 && !NOT_CUISINE.has(parts[2]))
      .map((parts) => parts[2]);
    const cuisine = fromProps || [...new Set(fromCats)].join(';');
    if (cuisine) tags.cuisine = cuisine;
  }
  if (!tags.name && p.name) tags.name = p.name;
  if (!tags['name:en'] && p.name_international?.en) tags['name:en'] = p.name_international.en;
  if (!tags.opening_hours && p.opening_hours) tags.opening_hours = p.opening_hours;
  if (!tags.website && p.website) tags.website = p.website;
  if (!tags.phone && p.contact?.phone) tags.phone = p.contact.phone;
  if (!tags['addr:street'] && p.street) tags['addr:street'] = p.street;
  if (!tags['addr:housenumber'] && p.housenumber) tags['addr:housenumber'] = p.housenumber;

  const diet = p.catering?.diet || {};
  if (!tags['diet:vegetarian'] && (diet.vegetarian || cats.includes('vegetarian'))) tags['diet:vegetarian'] = 'yes';
  if (!tags['diet:vegan'] && (diet.vegan || cats.includes('vegan'))) tags['diet:vegan'] = 'yes';
  const fac = p.facilities || {};
  if (!tags.wheelchair && (fac.wheelchair != null || cats.includes('wheelchair.yes'))) tags.wheelchair = yesNo(fac.wheelchair) || 'yes';
  if (!tags.changing_table && (fac.changing_table || cats.includes('amenity.toilet.changing_table'))) tags.changing_table = 'yes';
  if (!tags.fee && (cats.includes('no_fee') || cats.includes('no_fee.no'))) tags.fee = 'no';
  if (!tags.fee && cats.includes('fee')) tags.fee = 'yes';
  if (!tags.access && cats.some((c) => c === 'no_access' || c === 'access_limited.private')) tags.access = 'private';
  if (!tags.capacity && p.parking?.capacity) tags.capacity = String(p.parking.capacity);

  const id = raw.osm_id && raw.osm_type ? `${{ n: 'node', w: 'way', r: 'relation' }[raw.osm_type] || raw.osm_type}/${raw.osm_id}` : null;
  const lat = p.lat ?? f.geometry?.coordinates?.[1];
  const lon = p.lon ?? f.geometry?.coordinates?.[0];
  if (id) return { type: id.split('/')[0], id: id.split('/')[1], lat, lon, tags };
  // Geoapify's own ID, or position as a last resort, so places never collapse into one.
  return { type: 'geoapify', id: p.place_id || `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`, lat, lon, tags };
}

/** All three amenity kinds around a point from Geoapify, as Overpass-style elements. */
export async function geoapifyAmenities(lat, lon, caps, signal) {
  const key = geoapifyKey();
  if (!key) throw new Error('No GEOAPIFY_API_KEY');
  const results = await Promise.all(
    Object.entries(KIND_REQUESTS).map(async ([kind, { categories, limit }]) => {
      const url =
        `${BASE}?categories=${categories}&filter=circle:${lon},${lat},${caps[kind]}` +
        `&bias=proximity:${lon},${lat}&limit=${limit}&lang=en&apiKey=${encodeURIComponent(key)}`;
      const d = await fetchJson(url, { ttl: 0, timeout: 12_000, signal });
      return (d.features || []).map(featureToElement).filter((e) => e.tags.amenity && Number.isFinite(e.lat) && Number.isFinite(e.lon));
    }),
  );
  return results.flat();
}

// ---------------- Geocoding (planner destination lookup) ----------------

const AREA_RESULT_TYPES = new Set(['city', 'county', 'state', 'country', 'suburb', 'district', 'postcode']);

/** Same shape as the Nominatim results in osm.js, so callers can use either. 1 credit per call. */
export async function geoapifyGeocode(q, limit = 1) {
  const key = geoapifyKey();
  if (!key) throw new Error('No GEOAPIFY_API_KEY');
  const url =
    `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(q)}` +
    `&format=json&lang=en&limit=${limit}&apiKey=${encodeURIComponent(key)}`;
  const d = await fetchJson(url, { ttl: 24 * 3_600_000, timeout: 8000 });
  return (d.results || [])
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    .map((r) => {
      const name = r.name || r.city || r.address_line1 || r.formatted || q;
      const city = r.city && r.city !== name ? r.city : null;
      return {
        id: r.place_id ? `geoapify/${r.place_id}` : `geoapify/${r.lat},${r.lon}`,
        name,
        displayName: r.formatted || name,
        lat: r.lat,
        lon: r.lon,
        category: r.category || null,
        type: r.result_type || null,
        addressType: r.result_type || null,
        country: r.country || null,
        city,
        wikipedia: null,
        wikidata: null,
        isArea: AREA_RESULT_TYPES.has(r.result_type),
        importance: r.rank?.importance ?? r.rank?.confidence ?? 0,
      };
    });
}

// ---------------- Attractions (backup where Wikipedia has little coverage) ----------------

const ATTRACTION_CATEGORIES = 'tourism.attraction,tourism.sights,entertainment.museum,entertainment.culture,heritage,leisure.park';

/** Give Geoapify sights the OSM-style tags our attraction code reads (tourism / historic / leisure). */
function attractionTags(tags, cats) {
  if (tags.tourism || tags.historic || tags.leisure) return tags;
  // Most specific matching category (e.g. "tourism.sights.castle" rather than "tourism.sights").
  const has = (prefix) =>
    cats.filter((c) => c === prefix || c.startsWith(`${prefix}.`)).sort((a, b) => b.length - a.length)[0];
  const sight = has('tourism.sights');
  if (cats.some((c) => c.startsWith('entertainment.museum'))) tags.tourism = 'museum';
  else if (cats.some((c) => c.startsWith('entertainment.culture.gallery'))) tags.tourism = 'gallery';
  else if (has('tourism.attraction.viewpoint')) tags.tourism = 'viewpoint';
  else if (sight && /castle|fort|palace|ruines|ruins|memorial|monument|archaeological|city_gate|city_hall/.test(sight)) {
    tags.historic = sight.split('.').pop().replace('ruines', 'ruins');
  } else if (sight && /place_of_worship/.test(sight)) tags.amenity = 'place_of_worship';
  else if (has('leisure.park')) tags.leisure = 'park';
  else if (has('heritage')) tags.historic = 'monument';
  else tags.tourism = 'attraction';
  return tags;
}

/** Sights around a point as Overpass-style elements (named places only). ~1 credit per 20 results. */
export async function geoapifyAttractionElements(lat, lon, radius) {
  const key = geoapifyKey();
  if (!key) throw new Error('No GEOAPIFY_API_KEY');
  const url =
    `${BASE}?categories=${ATTRACTION_CATEGORIES}&conditions=named&filter=circle:${lon},${lat},${Math.round(radius)}` +
    `&bias=proximity:${lon},${lat}&limit=80&lang=en&apiKey=${encodeURIComponent(key)}`;
  const d = await fetchJson(url, { ttl: 0, timeout: 12_000 });
  return (d.features || [])
    .map((f) => {
      const el = featureToElement(f);
      el.tags = attractionTags(el.tags, f.properties?.categories || []);
      return el;
    })
    .filter((e) => e.tags.name && Number.isFinite(e.lat) && Number.isFinite(e.lon));
}
