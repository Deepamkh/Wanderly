import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, MapPinned, Utensils, Bath, Compass } from 'lucide-react';
import SearchBar from '../components/SearchBar.jsx';
import TopCities from '../components/TopCities.jsx';
import { api, exploreUrl } from '../lib/api.js';

const GlobeView = lazy(() => import('../components/GlobeView.jsx'));

export default function Home({ ready }) {
  const navigate = useNavigate();
  const [pins, setPins] = useState([]);
  const [top, setTop] = useState({ cities: [], source: null });
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    api.pins().then(setPins).catch(() => {});
    api.topCities().then(setTop).catch(() => {});
  }, []);

  const fade = (delay) => ({ initial: { opacity: 0, y: 24 }, animate: ready ? { opacity: 1, y: 0 } : {}, transition: { delay, duration: 0.6 } });

  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <motion.span className="eyebrow" {...fade(0.05)}><Sparkles size={15} /> Your one-stop travel companion</motion.span>
          <motion.h1 {...fade(0.15)}>
            Spin the globe.<br />
            <span className="grad-text">Find your next story.</span>
          </motion.h1>
          <motion.p className="lead" {...fade(0.25)}>
            Tap a pin to dive into the world’s favourite destinations – attractions, food by cuisine, washrooms, parking,
            tips and history in one place. Then let AI plan the trip.
          </motion.p>
          <motion.ul className="hero-feats" {...fade(0.35)}>
            <li><MapPinned size={16} /> Attractions by radius</li>
            <li><Utensils size={16} /> Food by cuisine</li>
            <li><Bath size={16} /> Nearest washrooms</li>
          </motion.ul>
        </div>

        <motion.div className="hero-globe" initial={{ opacity: 0, scale: 0.85 }} animate={ready ? { opacity: 1, scale: 1 } : {}} transition={{ duration: 1, ease: 'easeOut' }}>
          <Suspense fallback={<div className="globe-wrap globe-loading"><div className="globe-placeholder" /></div>}>
            <GlobeView pins={pins} focus={focus} onSelect={(p) => navigate(exploreUrl({ ...p, isArea: true }))} />
          </Suspense>
        </motion.div>
      </section>

      <motion.section className="search-section" {...fade(0.5)}>
        <SearchBar large />
      </motion.section>

      <section className="section">
        <div className="section-head">
          <h2>Top 10 most visited cities</h2>
          <p className="muted">Hover a card to fly the globe there · click to explore</p>
        </div>
        <TopCities cities={top.cities} source={top.source} onHover={setFocus} />
        <div className="browse-all">
          <button className="btn btn-soft btn-lg" onClick={() => navigate('/destinations')}>
            <Compass size={18} /> Browse 100 travel destinations
          </button>
        </div>
      </section>

      <section className="section">
        <div className="cta-banner">
          <div>
            <h2>Not sure where to start?</h2>
            <p>Tell our AI planner your dates, budget and vibe – get a day-by-day itinerary in seconds.</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/planner')}>
            <Sparkles size={18} /> Plan my trip
          </button>
        </div>
      </section>
    </main>
  );
}
