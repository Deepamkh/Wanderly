import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Utensils, Bath, Car } from 'lucide-react';
import { useNearbyAll, CAPS } from '../lib/useNearby.js';
import { fmtDist } from '../lib/api.js';
import RadiusControl from '../components/explore/RadiusControl.jsx';
import { Section, Food, Washrooms, Parking } from '../components/explore/Sections.jsx';

const KINDS = {
  food: { label: 'Restaurants', noun: 'places to eat', icon: Utensils, tint: '#fff4e8', List: Food },
  toilets: { label: 'Washrooms', noun: 'public washrooms', icon: Bath, tint: '#ecfbf3', List: Washrooms },
  parking: { label: 'Parking', noun: 'parking spots', icon: Car, tint: '#eef6ff', List: Parking },
};

/** "View all" page: every restaurant, washroom or parking spot around a place, nearest first. */
export default function Nearby() {
  const [params, setParams] = useSearchParams();
  const kind = KINDS[params.get('kind')] ? params.get('kind') : 'food';
  const meta = KINDS[kind];
  const name = params.get('name') || 'this place';
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const back = params.get('back');
  const [radius, setRadius] = useState(() => Math.min(20000, Math.max(500, Number(params.get('radius')) || 2000)));

  const center = useMemo(() => (Number.isFinite(lat) && Number.isFinite(lon) && params.get('lat') ? { lat, lon } : null), [lat, lon, params]);
  const near = useNearbyAll(center, radius);
  const state = near[kind];
  const within = Math.min(radius, CAPS[kind]);

  useEffect(() => {
    document.title = `${meta.label} near ${name} · Wanderly`;
  }, [meta.label, name]);

  const switchTo = (k) => {
    const next = new URLSearchParams(params);
    next.set('kind', k);
    next.delete('cuisine');
    setParams(next, { replace: true });
  };

  if (!center)
    return (
      <main className="page narrow">
        <div className="empty-state">
          <h1>We need a place first</h1>
          <p className="muted">Open a city or attraction, then use “View all” under restaurants, washrooms or parking.</p>
          <Link to="/destinations" className="btn btn-primary">Browse destinations</Link>
        </div>
      </main>
    );

  const { List } = meta;

  return (
    <main className="page">
      <Link className="back-link" to={back ? `/explore?${back}` : '/destinations'}>
        <ArrowLeft size={16} /> Back to {name}
      </Link>

      <div className="dest-head">
        <span className="eyebrow"><meta.icon size={15} /> Near {name}</span>
        <h1>{meta.label} near <span className="grad-text">{name}</span></h1>
        <p className="muted">
          {state.loading ? 'Finding places…' : `${state.count} ${meta.noun} within ${fmtDist(within)}, nearest first.`}
        </p>
      </div>

      <div className="chip-row kind-tabs" role="tablist">
        {Object.entries(KINDS).map(([k, m]) => (
          <button key={k} role="tab" aria-selected={k === kind} className={`chip-btn ${k === kind ? 'on' : ''}`} onClick={() => switchTo(k)}>
            <m.icon size={14} /> {m.label}
            {!near[k].loading && <span className="muted"> ({near[k].count})</span>}
          </button>
        ))}
      </div>

      <div className="explore-grid">
        <div className="explore-main">
          <Section
            id={kind}
            icon={meta.icon}
            title={`All ${meta.label.toLowerCase()}`}
            subtitle={`Within ${fmtDist(within)}${CAPS[kind] < radius ? ` (${meta.label.toLowerCase()} are limited to ${fmtDist(CAPS[kind])})` : ''}`}
            tint={meta.tint}
          >
            <List key={kind} state={state} center={center} initialCuisine={params.get('cuisine') || 'all'} />
          </Section>
        </div>
        <aside className="explore-side">
          <div className="sticky">
            <RadiusControl value={radius} onChange={setRadius} />
          </div>
        </aside>
      </div>
    </main>
  );
}
