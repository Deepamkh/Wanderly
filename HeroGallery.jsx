import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles, MapPin } from 'lucide-react';

export default function HeroGallery({ title, description, images = [], place }) {
  const [i, setI] = useState(0);
  const n = images.length;

  useEffect(() => setI(0), [title]);
  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5500);
    return () => clearInterval(t);
  }, [n, i]);

  const img = images[i];

  return (
    <header className="dest-hero">
      <AnimatePresence mode="sync">
        {img ? (
          <motion.div
            key={img.src}
            className="dest-hero-img"
            style={{ backgroundImage: `url("${img.src}")` }}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.9 }, scale: { duration: 6, ease: 'linear' } }}
          />
        ) : (
          <div className="dest-hero-img dest-hero-fallback" />
        )}
      </AnimatePresence>
      <div className="dest-hero-shade" />

      <div className="dest-hero-content">
        <motion.p className="eyebrow light" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <MapPin size={14} /> {[place?.city, place?.country].filter(Boolean).join(', ') || `${place?.lat?.toFixed(3)}, ${place?.lon?.toFixed(3)}`}
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>{title}</motion.h1>
        {description && <p className="dest-hero-desc">{description}</p>}
        <Link to={`/planner?dest=${encodeURIComponent(title)}`} className="btn btn-glass">
          <Sparkles size={16} /> Plan a trip here
        </Link>
      </div>

      {n > 1 && (
        <>
          <button className="hero-nav prev" aria-label="Previous photo" onClick={() => setI((i - 1 + n) % n)}><ChevronLeft /></button>
          <button className="hero-nav next" aria-label="Next photo" onClick={() => setI((i + 1) % n)}><ChevronRight /></button>
          <div className="hero-dots">
            {images.map((im, k) => (
              <button key={im.src} className={k === i ? 'on' : ''} aria-label={`Photo ${k + 1}`} onClick={() => setI(k)} />
            ))}
          </div>
        </>
      )}
      {img && (
        <a className="hero-credit" href={img.source} target="_blank" rel="noreferrer">
          Photo: Wikimedia Commons
        </a>
      )}
    </header>
  );
}
