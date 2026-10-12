import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Compass, Search, X } from 'lucide-react';
import { api, exploreUrl, titleCase } from '../lib/api.js';
import CardPhoto from '../components/CardPhoto.jsx';

const TINTS = ['#ffe3ec', '#e8ddff', '#dff4ff', '#e2f8ec', '#fff2db'];

export default function Destinations() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');

  const region = params.get('region') || 'all';
  const tag = params.get('type') || 'all';

  useEffect(() => {
    document.title = 'Explore 100 destinations · Wanderly';
    api.destinations().then(setData).catch((e) => setError(e.message));
  }, []);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    if (!data) return [];
    const q = text.trim().toLowerCase();
    return data.destinations.filter(
      (d) =>
        (region === 'all' || d.region === region) &&
        (tag === 'all' || d.tags.includes(tag)) &&
        (!q || `${d.name} ${d.country} ${d.blurb}`.toLowerCase().includes(q)),
    );
  }, [data, region, tag, text]);

  const filtered = region !== 'all' || tag !== 'all' || text.trim();

  return (
    <main className="page">
      <div className="dest-head">
        <span className="eyebrow"><Compass size={15} /> 100 places to go</span>
        <h1>Where will you go <span className="grad-text">next?</span></h1>
        <p className="muted">Cities, beaches, wonders and wild places on every continent. Pick one to see its attractions, food, tips and history.</p>
      </div>

      <div className="dest-filters">
        <label className="dest-filter-search">
          <Search size={18} className="search-icon" />
          <input id="dest-filter" value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by name or country…" aria-label="Filter destinations" />
          {text && (
            <button type="button" className="link-btn" onClick={() => setText('')} aria-label="Clear filter"><X size={16} /></button>
          )}
        </label>

        <span className="dest-filter-label">Region</span>
        <div className="chip-row">
          {['all', ...(data?.regions || [])].map((r) => (
            <button key={r} className={`chip-btn ${region === r ? 'on' : ''}`} onClick={() => setFilter('region', r)}>
              {r === 'all' ? 'All regions' : r}
            </button>
          ))}
        </div>

        <span className="dest-filter-label">Trip type</span>
        <div className="chip-row">
          {['all', ...(data?.tags || [])].map((t) => (
            <button key={t} className={`chip-btn ${tag === t ? 'on' : ''}`} onClick={() => setFilter('type', t)}>
              {t === 'all' ? 'Any type' : titleCase(t)}
            </button>
          ))}
        </div>

        {data && (
          <span className="dest-count">
            Showing {list.length} of {data.destinations.length}
            {filtered && (
              <>
                {' · '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setText('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  Clear filters
                </button>
              </>
            )}
          </span>
        )}
      </div>

      {error && <p className="notice error">{error}</p>}

      {!data && !error && (
        <div className="top-grid">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="city-card skeleton" />)}
        </div>
      )}

      {data && !list.length && <p className="notice">No destinations match these filters. Try another region or trip type.</p>}

      <div className="top-grid">
        {list.map((d, i) => (
          <motion.button
            key={d.id}
            className="city-card"
            style={{ '--tint': TINTS[d.id % TINTS.length] }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.03 }}
            whileHover={{ y: -6 }}
            onClick={() => navigate(exploreUrl({ name: d.name, lat: d.lat, lon: d.lon, wikipedia: `en:${d.wiki}`, isArea: true }))}
          >
            <div className="city-img">
              <CardPhoto src={d.image} alt={d.name} />
            </div>
            <div className="city-body">
              <span className="dest-region">{d.region}</span>
              <h3>{d.name}</h3>
              <p className="muted small">{d.country}</p>
              <p className="city-blurb">{d.blurb}</p>
              <span className="city-tags">
                {d.tags.map((t) => <span key={t} className="chip">{titleCase(t)}</span>)}
              </span>
            </div>
          </motion.button>
        ))}
      </div>
    </main>
  );
}
