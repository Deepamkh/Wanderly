import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { exploreUrl } from '../lib/api.js';
import CardPhoto from './CardPhoto.jsx';

const TINTS = ['#ffe3ec', '#e8ddff', '#dff4ff', '#e2f8ec', '#fff2db'];

export default function TopCities({ cities = [], source, onHover }) {
  const navigate = useNavigate();
  if (!cities.length)
    return (
      <div className="top-grid">
        {Array.from({ length: 10 }).map((_, i) => <div key={i} className="city-card skeleton" />)}
      </div>
    );

  return (
    <>
      <div className="top-grid">
        {cities.map((c, i) => (
          <motion.button
            key={c.name}
            className="city-card"
            style={{ '--tint': TINTS[i % TINTS.length] }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: (i % 5) * 0.06 }}
            whileHover={{ y: -6 }}
            onMouseEnter={() => onHover?.(c)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => navigate(exploreUrl({ ...c, isArea: true, wikipedia: `en:${c.wiki}` }))}
          >
            <div className="city-img">
              <CardPhoto src={c.image} alt={c.name} />
              <span className="city-rank">#{c.rank}</span>
            </div>
            <div className="city-body">
              <h3>{c.name}</h3>
              <p className="muted small">{c.country}</p>
              <p className="city-blurb">{c.blurb}</p>
              <span className="chip"><Users size={13} /> {c.arrivals} international visitors</span>
            </div>
          </motion.button>
        ))}
      </div>
      {source && (
        <p className="source-note">
          Ranking: <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
        </p>
      )}
    </>
  );
}
