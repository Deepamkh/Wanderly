# 🌍 Wanderly — every journey, one place

A one-stop travel web app built with **React (Vite)** on the front end and **Node.js (Express)** on the back end,
using **only free and open-source data, imagery, libraries and AI models** — no paid API keys required.

| Feature | How it works (free & open) |
|---|---|
| Animated intro (logo + tagline) | `framer-motion` SVG path drawing + letter animation |
| 3D interactive globe | `react-globe.gl` / three.js with **NASA Blue Marble** (day) & **NASA Black Marble** (night) imagery (CDN by default, `npm run textures --prefix client` to self-host) |
| Interactive pins on top tourist cities | 45 curated cities with signature sights; hover to preview, click to fly in & explore |
| Search cities / attractions | **OpenStreetMap Nominatim** geocoding with autocomplete |
| Top 10 most visited cities | Euromonitor *Top 100 City Destinations Index 2025* (international arrivals) + Wikipedia thumbnails |
| Header photo gallery | **Wikipedia / Wikimedia Commons** media |
| Top attractions + adjustable radius | **Wikipedia GeoSearch** with photos, ranked by 30-day article views (real popularity); OpenStreetMap fallback for remote areas |
| Nearest restaurants per cuisine | **Geoapify Places API** (free key, OpenStreetMap data) or Overpass fallback, grouped by cuisine, veg filter |
| Nearest washrooms | Geoapify / Overpass `amenity=toilets` (free/paid, wheelchair, baby change) |
| Parking spots | Geoapify / Overpass `amenity=parking` (type, fee, capacity) |
| Map of everything nearby | `react-leaflet` + OpenStreetMap tiles (no API key) with a pastel tint, layer toggles |
| Top reviews | Community reviews stored by the app (JSON file) with "helpful" voting |
| Tips | **Wikivoyage** sections (Stay safe, Get around, Respect, …) |
| History & details | **Wikipedia** summary + History section |
| AI trip planner | **Ollama** + open models (Llama 3.1, Qwen, Mistral…) grounded with real OSM places; automatic offline "smart planner" fallback |
| Pastel theme | Hand-written CSS design system (Fredoka + Nunito from Google Fonts) |

---

## 🚀 Quick start

Requirements: **Node.js 18.17+** (20 or 22 recommended).

```bash
# 1. install everything
npm install            # installs the root helper (concurrently)
npm run install:all    # installs server + client

# 2. configure the API (defaults work out of the box)
cp server/.env.example server/.env
#   → set USER_AGENT to include your contact email (OSM/Wikimedia policy)

# 3. run API (http://localhost:5000) + web app (http://localhost:5173)
npm run dev
```

Open **http://localhost:5173**.

Optional – self-host the NASA globe textures instead of loading them from the unpkg CDN:

```bash
npm run textures --prefix client
echo "VITE_GLOBE_LOCAL=1" > client/.env
```

### Turn on the AI planner (free, local)

1. Install Ollama → https://ollama.com/download
2. Pull an open model: `ollama pull llama3.1:8b` (or `qwen2.5:7b`, `mistral`, `gemma2:9b`)
3. Keep `LLM_PROVIDER=ollama` in `server/.env` and restart.

No GPU / no Ollama? The planner still works: it falls back to a built-in itinerary engine that clusters real
OpenStreetMap attractions by neighbourhood and adds nearby lunch/dinner stops. You can also point
`LLM_PROVIDER=openai` at any OpenAI-compatible server (LM Studio, llama.cpp, vLLM, or a free hosted tier).

### Production build

```bash
npm run build   # builds client/dist
npm start       # Express serves the API and the built React app on :5000
```

Free hosting ideas: Render / Railway / Fly.io free tiers for the Node server (serves the UI too), or the UI on
Netlify / Vercel / Cloudflare Pages with `VITE_API_URL=https://your-api.example.com` set at build time.

---

## 🗂 Project structure

```
wanderly/
├── client/                    React + Vite
│   ├── scripts/               fetch-textures.mjs (self-host NASA globe imagery)
│   └── src/
│       ├── components/        Intro, Logo, GlobeView, SearchBar, TopCities, Navbar, Footer
│       │   └── explore/       HeroGallery, RadiusControl, NearbyMap, Sections, Reviews
│       ├── pages/             Home, Explore (city/attraction), Planner (AI)
│       ├── lib/               api client, useNearby hook
│       └── styles.css         pastel design system
└── server/                    Node.js + Express
    └── src/
        ├── routes/            places (search/details/nearby), reviews
        ├── services/          osm (Nominatim+Overpass), wiki (Wikipedia/Wikivoyage), llm, planner
        ├── data/cities.js     top-10 ranking + globe pins
        └── utils/http.js      cached fetch, rate gate, concurrency limiter
```

### API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/cities/pins` | Globe pins |
| GET | `/api/cities/top` | Top-10 cities with photos |
| GET | `/api/places/search?q=` | Autocomplete |
| GET | `/api/places/details?q=` (or `&lat&lon&wiki`) | Header photos, overview, history, tips |
| GET | `/api/places/nearby?lat&lon&radius&kind=attractions\|food\|toilets\|parking` | POIs in radius |
| GET/POST | `/api/reviews/:place` · `/api/reviews/:place/:id/helpful` | Community reviews |
| POST | `/api/planner` | AI itinerary |

---

## 🤝 Fair use of free services

These services are free because the community runs them — please be a good citizen:

* **Nominatim** – max 1 request/second and a real `User-Agent` (both enforced by the server); results are cached 24 h.
  For heavy traffic self-host Nominatim or use Photon.
* **Overpass** – the server limits concurrency to 2 and rotates between mirrors; results are cached 6 h.
  For production traffic, run your own Overpass instance (Docker image available).
* **Map tiles** – OpenStreetMap's standard tiles are free for light use with attribution (no API key). For scale, self-host tiles
  (e.g. OpenMapTiles / Protomaps PMTiles) and set `VITE_TILE_URL` (and `VITE_TILE_ATTRIBUTION`) when building the client.
* **Wikipedia / Wikivoyage / Commons** – content is CC BY-SA; attribution links are shown in the UI.

## ⚡ Faster restaurants, washrooms & parking (Geoapify, free)

1. Sign up at [geoapify.com](https://www.geoapify.com/) (free plan, no credit card) and create a project to get an API key.
2. Add it to the server, **never to the code or GitHub**:
   - **Locally:** `GEOAPIFY_API_KEY=your-key` in `server/.env`, then restart `npm run dev`.
   - **Render:** service → *Environment* → add variable `GEOAPIFY_API_KEY` → *Save* (Render restarts).
3. Each new area uses about 20 credits (cached for 12 hours), so the free 3,000 daily credits cover roughly
   150 new areas a day. If Geoapify is unavailable or over quota, Wanderly falls back to the public Overpass servers.
4. Lists show "Powered by Geoapify", as the free plan requires.

## ℹ️ Notes & limitations

* **Reviews**: there's no free, open source of Google or Tripadvisor reviews (both are paid and restrict reuse), so
  Wanderly has its own community review system. Move it to SQLite/Postgres when you outgrow the JSON file.
* POI completeness depends on OpenStreetMap coverage, which is excellent in most major cities and improving
  everywhere — contributing back at openstreetmap.org improves Wanderly too.
* The top-10 list comes from Euromonitor's 2025 index; update `server/src/data/cities.js` when a new edition ships.

## 📜 Credits & licences

NASA Visible Earth (public domain) · © OpenStreetMap contributors (ODbL) · Wikipedia, Wikivoyage & Wikimedia
Commons (CC BY-SA) · React, Vite, three.js, globe.gl, Leaflet, framer-motion, lucide (MIT/ISC/BSD) · Ollama (MIT) ·
Meta Llama / Qwen / Mistral open-weight models under their respective licences.
