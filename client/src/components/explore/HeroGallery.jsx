import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles, MapPin } from 'lucide-react';

const SLIDE_MS = 5500;

export default function HeroGallery({ title, description, images = [], place }) {
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(() => new Set());
  const [failed, setFailed] = useState(() => new Set());

  // Preload every photo up front: rotate only through ones that loaded, drop any that fail.
  useEffect(() => {
    setI(0);
    setLoaded(new Set());
    setFailed(new Set());
    let alive = true;
    const imgs = images.map((im) => {
      const el = new Image();
      el.decoding = 'async';
      el.onload = () => alive && setLoaded((s) => new Set(s).add(im.src));
      el.onerror = () => alive && setFailed((s) => new Set(s).add(im.src));
      el.src = im.src;
      return el;
    });
    return () => {
      alive = false;
      imgs.forEach((el) => {
        el.onload = el.onerror = null;
      });
    };
  }, [images]);

  const list = useMemo(() => images.filter((im) => !failed.has(im.src)), [images, failed]);
  const n = list.length;
  const index = n ? Math.min(i, n - 1) : 0;

  // Step to the next photo that has finished loading (or stay put if none has yet).
  const step = (dir) => {
    if (n < 2) return;
    for (let k = 1; k < n; k++) {
      const j = (index + dir * k + n * k) % n;
      if (loaded.has(list[j].src)) return setI(j);
    }
  };

  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => step(1), SLIDE_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, index, loaded]);

  const img = list[index];
  const showImg = img && loaded.has(img.src);

  return (
    <header className="dest-hero">
      <AnimatePresence mode="sync">
        {showImg ? (
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
          <div key="fallback" className="dest-hero-img dest-hero-fallback" />
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
          <button className="hero-nav prev" aria-label="Previous photo" onClick={() => step(-1)}><ChevronLeft /></button>
          <button className="hero-nav next" aria-label="Next photo" onClick={() => step(1)}><ChevronRight /></button>
          <div className="hero-dots">
            {list.map((im, k) => (
              <button
                key={im.src}
                className={k === index ? 'on' : ''}
                aria-label={`Photo ${k + 1}`}
                disabled={!loaded.has(im.src)}
                onClick={() => setI(k)}
              />
            ))}
          </div>
        </>
      )}
      {showImg && (
        <a className="hero-credit" href={img.source} target="_blank" rel="noreferrer">
          Photo: Wikimedia Commons
        </a>
      )}
    </header>
  );
}
