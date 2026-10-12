import { Router } from 'express';
import { geocode, nearby, nearbyAll } from '../services/osm.js';
import { resolveTitle, summary, images, history, travelTips, thumbnails, parseWikiTag } from '../services/wiki.js';

const router = Router();
const num = (v) => (v === undefined || v === '' ? NaN : Number(v));

// GET /api/places/search?q=eiffel
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    res.json(await geocode(q, 6));
  } catch (e) {
    next(e);
  }
});

// GET /api/places/details?q=Paris  (or ?q=Louvre&lat=..&lon=..&wiki=en:Louvre&city=Paris)
router.get('/details', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const lat = num(req.query.lat);
    const lon = num(req.query.lon);
    let place;

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      place = {
        name: q || 'Selected place',
        lat,
        lon,
        wikipedia: req.query.wiki || null,
        wikidata: req.query.wikidata || null,
        city: req.query.city || null,
        isArea: req.query.area === '1',
      };
    } else {
      if (!q) return res.status(400).json({ error: 'Missing search query' });
      const [hit] = await geocode(q, 1);
      if (!hit) return res.status(404).json({ error: `We couldn't find "${q}". Try a different spelling.` });
      place = hit;
    }

    const title = await resolveTitle(place).catch(() => null);

    const [sum, imgs, hist, tips] = await Promise.allSettled([
      title ? summary(title) : null,
      title ? images(title) : [],
      title ? history(title) : { paragraphs: [] },
      title ? travelTips(title) : { tips: [] },
    ]);
    const val = (r, d) => (r.status === 'fulfilled' && r.value ? r.value : d);

    let tipsVal = val(tips, { tips: [] });
    if (!tipsVal.tips.length && place.city) tipsVal = await travelTips(place.city).catch(() => tipsVal);

    const s = val(sum, null);
    const gallery = val(imgs, []);
    // The page's lead photo is already first in the gallery; fall back to it only when the gallery is empty.
    if (!gallery.length && s?.image) gallery.push({ src: s.image, caption: null, source: s.url });

    res.json({
      place,
      title: s?.title || place.name,
      description: s?.description || null,
      extract: s?.extract || null,
      wikiUrl: s?.url || null,
      images: gallery.slice(0, 8),
      history: val(hist, { paragraphs: [] }),
      tips: tipsVal.tips,
      tipsUrl: tipsVal.url || null,
      defaultRadius: place.isArea ? 5000 : 1500,
    });
  } catch (e) {
    next(e);
  }
});

async function addAttractionPhotos(items) {
  const titles = items.map((p) => parseWikiTag(p.wikipedia)).filter((t) => t?.lang === 'en').map((t) => t.title);
  const thumbs = await thumbnails(titles, 480).catch(() => ({}));
  for (const p of items) {
    const t = parseWikiTag(p.wikipedia);
    p.image = t?.lang === 'en' ? thumbs[t.title] || null : null;
  }
}

// GET /api/places/nearby-all?lat=..&lon=..&radius=5000
// Attractions, food, washrooms and parking in ONE upstream request (radius is capped per kind).
router.get('/nearby-all', async (req, res, next) => {
  try {
    const lat = num(req.query.lat);
    const lon = num(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat & lon required' });
    const radius = Math.round(Math.min(20000, Math.max(200, num(req.query.radius) || 2000)));
    const data = await nearbyAll(lat, lon, radius);
    await addAttractionPhotos(data.attractions);
    res.set('Cache-Control', data.stale ? 'no-store' : 'public, max-age=600');
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// GET /api/places/nearby?lat=..&lon=..&radius=2000&kind=attractions|food|toilets|parking
router.get('/nearby', async (req, res, next) => {
  try {
    const lat = num(req.query.lat);
    const lon = num(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'lat & lon required' });
    const radius = Math.round(Math.min(20000, Math.max(200, num(req.query.radius) || 2000)));
    const kind = String(req.query.kind || 'attractions');
    const data = await nearby(lat, lon, radius, kind);

    if (kind === 'attractions') await addAttractionPhotos(data.items);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

export default router;
