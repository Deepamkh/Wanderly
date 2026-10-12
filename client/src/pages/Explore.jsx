import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Landmark, Utensils, Bath, Car, MessageSquareHeart, Lightbulb, ScrollText, Map as MapIcon, ArrowLeft } from 'lucide-react';
import { api, slugify, fmtDist } from '../lib/api.js';
import { useNearbyAll, CAPS } from '../lib/useNearby.js';
import SearchBar from '../components/SearchBar.jsx';
import HeroGallery from '../components/explore/HeroGallery.jsx';
import RadiusControl from '../components/explore/RadiusControl.jsx';
import Reviews from '../components/explore/Reviews.jsx';
import GoogleReviews from '../components/explore/GoogleReviews.jsx';
import { Section, Attractions, Food, Washrooms, Parking, Tips, History } from '../components/explore/Sections.jsx';

const NearbyMap = lazy(() => import('../components/explore/NearbyMap.jsx'));

const NAV = [
  ['overview', 'Overview'],
  ['attractions', 'Attractions'],
  ['map', 'Map'],
  ['food', 'Food'],
  ['washrooms', 'Washrooms'],
  ['parking', 'Parking'],
  ['reviews', 'Reviews'],
  ['tips', 'Tips'],
  ['history', 'History'],
];

export default function Explore() {
  const [params] = useSearchParams();
  const key = params.toString();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [radius, setRadius] = useState(null);
  const [visible, setVisible] = useState({ attractions: true, food: false, toilets: true, parking: false });

  useEffect(() => {
    setData(null);
    setError(null);
    setRadius(null);
    api
      .details(Object.fromEntries(params))
      .then((d) => {
        setData(d);
        setRadius(d.defaultRadius);
        document.title = `${d.title} · Wanderly`;
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const center = useMemo(() => (data ? { lat: data.place.lat, lon: data.place.lon } : null), [data]);
  const { attractions, food, toilets, parking } = useNearbyAll(center, radius);

  if (error)
    return (
      <main className="page narrow">
        <div className="empty-state">
          <h1>Hmm, we got lost 🧭</h1>
          <p className="muted">{error}</p>
          <SearchBar />
          <Link to="/" className="btn btn-soft"><ArrowLeft size={16} /> Back to the globe</Link>
        </div>
      </main>
    );

  if (!data)
    return (
      <main>
        <div className="dest-hero skeleton" />
        <div className="page"><div className="skeleton block" /><div className="skeleton block" /></div>
      </main>
    );

  const city = data.place.isArea ? data.title : data.place.city;
  // Full-list page for restaurants / washrooms / parking ("View all").
  const viewAll = (kind) =>
    `/nearby?${new URLSearchParams({ kind, lat: center.lat, lon: center.lon, radius, name: data.title, back: params.toString() })}`;

  return (
    <main className="explore">
      <HeroGallery title={data.title} description={data.description} images={data.images} place={data.place} />

      <nav className="dest-nav" aria-label="Sections">
        {NAV.map(([id, label]) => (
          <a key={id} href={`#${id}`}>{label}</a>
        ))}
      </nav>

      <div className="page explore-grid">
        <div className="explore-main">
          <Section id="overview" icon={ScrollText} title={`About ${data.title}`} tint="#f3ecff">
            <p className="history-lead">{data.extract || 'No overview available yet.'}</p>
            <div className="quick-facts">
              <span className="chip lilac">{attractions.loading ? '…' : attractions.count ?? 0} attractions nearby</span>
              <span className="chip peach">{food.loading ? '…' : food.count ?? 0} places to eat</span>
              <span className="chip mint">{toilets.loading ? '…' : toilets.count ?? 0} washrooms</span>
              <span className="chip sky">{parking.loading ? '…' : parking.count ?? 0} parking spots</span>
            </div>
          </Section>

          <Section id="attractions" icon={Landmark} title="Top attractions" subtitle="Ranked by popularity and distance within your radius" tint="#f3ecff">
            <Attractions state={attractions} center={center} city={city} />
          </Section>

          <Section id="map" icon={MapIcon} title="Around you" subtitle="Toggle layers to see what’s nearby" tint="#eef6ff">
            <Suspense fallback={<div className="skeleton map" />}>
              <NearbyMap
                center={center}
                radius={radius}
                visible={visible}
                onToggle={(k) => setVisible((v) => ({ ...v, [k]: !v[k] }))}
                layers={{ attractions: attractions.items, food: food.items, toilets: toilets.items, parking: parking.items }}
              />
            </Suspense>
          </Section>

          <Section id="food" icon={Utensils} title="Restaurants by cuisine" subtitle={`Nearest 5 within ${fmtDist(Math.min(radius, CAPS.food))}`} tint="#fff4e8">
            <Food state={food} center={center} limit={5} viewAllHref={viewAll('food')} />
          </Section>

          <div className="two-col">
            <Section id="washrooms" icon={Bath} title="Nearest washrooms" subtitle={`Nearest 5 within ${fmtDist(Math.min(radius, CAPS.toilets))}`} tint="#ecfbf3">
              <Washrooms state={toilets} center={center} limit={5} viewAllHref={viewAll('toilets')} />
            </Section>
            <Section id="parking" icon={Car} title="Parking spots" subtitle={`Nearest 5 within ${fmtDist(Math.min(radius, CAPS.parking))}`} tint="#eef6ff">
              <Parking state={parking} center={center} limit={5} viewAllHref={viewAll('parking')} />
            </Section>
          </div>

          <Section
            id="reviews"
            icon={MessageSquareHeart}
            title="Top reviews"
            subtitle="Rating and reviews from Google"
            tint="#fff0f4"
          >
            <GoogleReviews
              name={data.title}
              lat={data.place.lat}
              lon={data.place.lon}
              city={city}
              fallback={<Reviews placeKey={slugify(data.title)} placeName={data.title} />}
            />
          </Section>

          <Section id="tips" icon={Lightbulb} title="Traveller tips" tint="#fffbe6">
            <Tips tips={data.tips} url={data.tipsUrl} />
          </Section>

          <Section id="history" icon={ScrollText} title="History & details" tint="#f3ecff">
            <History history={data.history} wikiUrl={data.wikiUrl} />
          </Section>
        </div>

        <aside className="explore-side">
          <div className="sticky">
            <RadiusControl value={radius} onChange={setRadius} />
            <div className="side-card">
              <p className="small muted">Search somewhere else</p>
              <SearchBar placeholder="City or attraction…" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
