// Photos for attraction cards, from free Wikimedia sources.
import { thumbnails, parseWikiTag, enTitlesFromWikidata, nearbyArticles, commonsPhotoNear } from './wiki.js';
import { haversine } from '../utils/http.js';

const normName = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|of|de|du|la|le|des|and)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Does a Wikipedia article title plausibly name this attraction? */
export function namesMatch(name, title) {
  const a = normName(name);
  const b = normName(title);
  if (!a || !b) return false;
  if (a === b || (a.length > 4 && b.includes(a)) || (b.length > 4 && a.includes(b))) return true;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / Math.max(ta.size, tb.size) >= 0.6;
}

const PHOTO_FROM_COMMONS_MAX = 24; // only the attractions people see first

/**
 * Photo for each attraction card, best source first:
 *  1. its English Wikipedia article (OSM `wikipedia` tag, or via the `wikidata` tag)
 *  2. a nearby Wikipedia article with a matching name (for places with no wiki link at all)
 *  3. a geotagged Wikimedia Commons photo taken at the spot
 */
export async function addAttractionPhotos(items, center, radius) {
  if (!items.length) return;
  const enTitle = (p) => {
    const t = parseWikiTag(p.wikipedia);
    return t?.lang === 'en' ? t.title : null;
  };

  // 1. Linked articles
  const needWd = items.filter((p) => !enTitle(p) && p.wikidata).map((p) => p.wikidata);
  const fromWd = await enTitlesFromWikidata(needWd).catch(() => ({}));
  const titleOf = (p) => enTitle(p) || fromWd[p.wikidata] || null;
  const thumbs = await thumbnails(items.map(titleOf), 500).catch(() => ({}));
  for (const p of items) {
    const title = titleOf(p);
    p.image = title ? thumbs[title] || null : null;
    if (title && !enTitle(p)) p.wikipedia = `en:${title}`; // better details page when clicked
  }

  // 2. Nearby articles matched by name and position
  let missing = items.filter((p) => !p.image);
  if (missing.length && center) {
    const articles = await nearbyArticles(center.lat, center.lon, radius).catch(() => []);
    for (const p of missing) {
      const hit = articles.find((a) => haversine(p.lat, p.lon, a.lat, a.lon) < 600 && namesMatch(p.name, a.title));
      if (hit) {
        p.image = hit.thumb;
        if (!p.wikipedia) p.wikipedia = `en:${hit.title}`;
      }
    }
  }

  // 3. Geotagged Commons photos for the first cards still without one
  missing = items.filter((p) => !p.image).slice(0, PHOTO_FROM_COMMONS_MAX);
  await Promise.all(
    missing.map((p) =>
      commonsPhotoNear(p.lat, p.lon)
        .then((src) => {
          if (src) p.image = src;
        })
        .catch(() => {}),
    ),
  );
}
