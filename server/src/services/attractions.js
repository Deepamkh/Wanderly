// Top attractions near a point, from Wikipedia: fast (Wikimedia's global CDN), free, keyless,
// photos included, and ranked by how many people read each place's article (a real popularity signal).
// Falls back to OpenStreetMap attractions where Wikipedia has little coverage.
import { fetchJson, haversine } from '../utils/http.js';
import { osmAttractions, bucketFor } from './osm.js';
import { addAttractionPhotos } from './photos.js';

const WP = 'https://en.wikipedia.org/w/api.php';
const DAY = 24 * 3_600_000;
const FRESH_MS = 12 * 3_600_000;
export const WIKI_MAX_RADIUS = 10000; // Wikipedia geosearch limit
const KEEP = 120;

// Kinds of article that are places to visit → card label. First match wins.
const CATEGORIES = [
  [/\b(art )?museum\b/i, 'museum'],
  [/\bgallery\b/i, 'gallery'],
  [/\b(cathedral|basilica|church|chapel|abbey|monastery|convent)\b/i, 'church'],
  [/\bmosque\b/i, 'mosque'],
  [/\b(temple|shrine|pagoda|stupa)\b/i, 'temple'],
  [/\bsynagogue\b/i, 'synagogue'],
  [/\b(palace|château|chateau|castle|fortress|fort|citadel)\b/i, 'palace / castle'],
  [/\b(tower|skyscraper|observation deck)\b/i, 'tower'],
  [/\b(monument|memorial|statue|obelisk|triumphal arch|arch|column)\b/i, 'monument'],
  [/\b(park|garden|botanical|arboretum)\b/i, 'park'],
  [/\b(square|plaza|piazza)\b/i, 'square'],
  [/\bbridge\b/i, 'bridge'],
  [/\b(opera house|theatre|theater|concert hall)\b/i, 'theatre'],
  [/\b(zoo|aquarium|theme park|amusement park)\b/i, 'family'],
  [/\b(market|bazaar|souk)\b/i, 'market'],
  [/\b(fountain)\b/i, 'fountain'],
  [/\b(cemetery|necropolis|mausoleum|tomb)\b/i, 'historic site'],
  [/\b(ruins?|archaeological|ancient|amphitheatre|amphitheater|historic)\b/i, 'historic site'],
  [/\b(beach|bay|lake|waterfall|mountain|hill|island|gorge|canyon|cave|viewpoint)\b/i, 'nature'],
  [/\b(library)\b/i, 'library'],
  [/\b(stadium|arena)\b/i, 'stadium'],
  [/\b(landmark|attraction|building|street|avenue|boulevard|quarter)\b/i, 'landmark'],
];

// Articles that are near a place but aren't things to visit.
const NOT_ATTRACTION =
  /\b(station|metro|subway|railway|line \d|tram|bus |airport|school|lycée|university|college|institute|hospital|clinic|company|corporation|brand|bank|hotel|embassy|consulate|ministry|headquarters|office|court|prison|police|fire station|constituency|electoral|arrondissement|commune|municipality|district of|ward|neighbourhood|neighborhood|suburb|village|town in|city in|capital of|administrative|football|club|team|association|organisation|organization|newspaper|magazine|film|album|song|novel|television|tv series|band|singer|actor|person|people|born|died|politician|event|battle|treaty|riot|attack|fire of|election)\b/i;

const ARTICLE_TITLE_SKIP = /^(List of|Timeline of|History of|Geography of|Economy of|Culture of|Demographics of)\b/i;

function categorise(description, title) {
  const text = `${description || ''} ${title}`;
  for (const [re, label] of CATEGORIES) if (re.test(text)) return label;
  return null;
}

/** One geosearch call for the list, then parallel batches of 50 for photos, descriptions and views. */
async function wikiAttractions(lat, lon, radius) {
  const r = Math.round(Math.min(WIKI_MAX_RADIUS, Math.max(100, radius)));
  const geo = await fetchJson(
    `${WP}?action=query&format=json&list=geosearch&gscoord=${lat}|${lon}&gsradius=${r}&gslimit=300&gsnamespace=0`,
    { ttl: DAY, timeout: 10_000 },
  );
  const hits = (geo.query?.geosearch || []).filter((g) => !ARTICLE_TITLE_SKIP.test(g.title));
  if (!hits.length) return [];

  const ids = hits.map((h) => h.pageid);
  const batches = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  const pages = new Map();
  await Promise.all(
    batches.map(async (batch) => {
      let cont = '';
      // pageimages/pageviews may each need a continuation; a couple of rounds covers 50 pages.
      for (let round = 0; round < 4; round++) {
        const d = await fetchJson(
          `${WP}?action=query&format=json&pageids=${batch.join('|')}` +
            `&prop=pageimages|description|pageviews&piprop=thumbnail&pithumbsize=500&pilimit=50&pvipdays=30${cont}`,
          { ttl: DAY, timeout: 10_000 },
        );
        for (const p of Object.values(d.query?.pages || {})) {
          const prev = pages.get(p.pageid) || {};
          if (p.thumbnail) prev.image = p.thumbnail.source;
          if (p.description) prev.description = p.description;
          if (p.pageviews) prev.views = Object.values(p.pageviews).reduce((s, v) => s + (v || 0), 0);
          pages.set(p.pageid, prev);
        }
        if (!d.continue) break;
        cont = Object.entries(d.continue).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
      }
    }),
  );

  const items = [];
  for (const h of hits) {
    const info = pages.get(h.pageid) || {};
    const desc = info.description || '';
    if (NOT_ATTRACTION.test(desc)) continue;
    const category = categorise(desc, h.title);
    const views = info.views || 0;
    // Few readers and nothing that says "sight" → probably not worth a card.
    if ((!category || category === 'landmark') && views < 3000) continue;
    if (!desc && views < 1000) continue;
    const distance = Math.round(haversine(lat, lon, h.lat, h.lon));
    items.push({
      id: `wiki/${h.pageid}`,
      name: h.title.replace(/\s*\([^)]*\)$/, ''),
      lat: h.lat,
      lon: h.lon,
      distance,
      category: category || 'landmark',
      description: desc || null,
      wikipedia: `en:${h.title}`,
      image: info.image || null,
      views,
      openingHours: null,
      fee: null,
      wheelchair: null,
      // Popularity first; photos and closeness as tie-breakers.
      score: Math.log10(views + 10) + (info.image ? 0.4 : 0) + (category && category !== 'landmark' ? 0.3 : 0) - (distance / Math.max(r, 1)) * 0.2,
    });
  }
  items.sort((a, b) => b.score - a.score);
  return items.slice(0, KEEP);
}

const cache = new Map();
const flights = new Map();
const round4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * Top attractions around a point, best first.
 * Returns { center, radius, source: 'wikipedia' | 'wikipedia+osm' | 'osm', items }.
 */
export async function getAttractions(lat, lon, radius) {
  lat = round4(lat);
  lon = round4(lon);
  const bucket = Math.min(WIKI_MAX_RADIUS, bucketFor(radius));
  const key = `${lat},${lon},${bucket}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.value;

  if (!flights.has(key)) {
    flights.set(
      key,
      (async () => {
        let items = [];
        let source = 'wikipedia';
        try {
          items = await wikiAttractions(lat, lon, bucket);
        } catch (e) {
          console.warn('[attractions] wikipedia failed:', e.message);
        }
        // Thin coverage (small towns, remote areas) → top up from OpenStreetMap.
        if (items.length < 6) {
          try {
            const osm = await osmAttractions(lat, lon, bucket);
            const names = new Set(items.map((i) => i.name.toLowerCase()));
            const extra = osm.filter((o) => !names.has(o.name.toLowerCase())).slice(0, 40);
            await addAttractionPhotos(extra, { lat, lon }, bucket).catch(() => {});
            items = items.concat(extra);
            source = items.length === extra.length ? 'osm' : 'wikipedia+osm';
          } catch (e) {
            if (!items.length) throw Object.assign(new Error('Attractions are busy loading. Retrying shortly…'), { status: 503, expose: true });
          }
        }
        const value = { center: { lat, lon }, radius: bucket, source, items };
        cache.set(key, { at: Date.now(), value });
        if (cache.size > 500) cache.delete(cache.keys().next().value);
        return value;
      })().finally(() => flights.delete(key)),
    );
  }
  return flights.get(key);
}
