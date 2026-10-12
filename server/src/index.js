import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import placesRouter from './routes/places.js';
import reviewsRouter from './routes/reviews.js';
import { planTrip } from './services/planner.js';
import { llmProvider } from './services/llm.js';
import { thumbnails } from './services/wiki.js';
import { TOP_CITIES, TOP_CITIES_SOURCE, GLOBE_PINS } from './data/cities.js';
import { DESTINATIONS, REGIONS, TAGS } from './data/destinations.js';
import { prewarm } from './services/osm.js';
import { getAttractions } from './services/attractions.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, llm: llmProvider() }));

app.get('/api/cities/pins', (_req, res) => res.json(GLOBE_PINS));

app.get('/api/cities/top', async (_req, res) => {
  const thumbs = await thumbnails(TOP_CITIES.map((c) => c.wiki), 500).catch(() => ({}));
  res.json({ source: TOP_CITIES_SOURCE, cities: TOP_CITIES.map((c) => ({ ...c, image: thumbs[c.wiki] || null })) });
});

// 100 travel destinations for the Explore page, with Wikipedia photos (batched, cached 24 h).
app.get('/api/destinations', async (_req, res) => {
  const thumbs = await thumbnails(DESTINATIONS.map((d) => d.wiki), 500).catch(() => ({}));
  res.json({
    regions: REGIONS,
    tags: TAGS,
    destinations: DESTINATIONS.map((d) => ({ ...d, image: thumbs[d.wiki] || null })),
  });
});

app.use('/api/places', placesRouter);
app.use('/api/reviews', reviewsRouter);

app.post('/api/planner', async (req, res, next) => {
  try {
    res.json(await planTrip(req.body || {}));
  } catch (e) {
    next(e);
  }
});

// Serve the built React app in production (npm run build && npm start).
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  // Our own errors carry a user-facing message (expose: true); upstream failures get a friendly one.
  if (err.expose) return res.status(err.status || 500).json({ error: err.message });
  const upstream = err.status >= 500 || err.status === 429 || err.name === 'TimeoutError' || err.name === 'AbortError';
  const status = upstream ? 502 : err.status && err.status < 600 ? err.status : 500;
  res.status(status).json({
    error: upstream ? 'A free data provider is busy right now. Please try again in a moment.' : err.message || 'Something went wrong',
  });
});

app.listen(PORT, () => {
  console.log(`✈  Wanderly API on http://localhost:${PORT}  (LLM: ${llmProvider()})`);

  // Pre-load attractions + restaurants/washrooms/parking for the top 10 cities so their pages open instantly.
  // Runs quietly in the background, one city at a time. Set PREWARM=0 to turn off.
  if (process.env.PREWARM !== '0') {
    setTimeout(() => {
      prewarm(TOP_CITIES, 5000, { after: (c) => getAttractions(c.lat, c.lon, 5000).catch(() => {}) })
        .then((n) => n && console.log(`[prewarm] ready: ${n} cities`))
        .catch(() => {});
    }, 5000);
  }
});
