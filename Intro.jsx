import { useEffect } from 'react';
import { motion } from 'framer-motion';
import Logo from './Logo.jsx';

const NAME = 'Wanderly';
const TAGLINE = 'Every journey, one place.';
const DURATION = 3800;

export default function Intro({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, DURATION);
    const onKey = (e) => (e.key === 'Escape' || e.key === 'Enter') && onDone();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onDone]);

  return (
    <motion.div
      className="intro"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.06, filter: 'blur(6px)', transition: { duration: 0.8, ease: 'easeInOut' } }}
      role="dialog"
      aria-label="Welcome to Wanderly"
    >
      <div className="intro-blobs" aria-hidden>
        <span className="b1" /><span className="b2" /><span className="b3" /><span className="b4" />
      </div>

      <div className="intro-center">
        <motion.div className="intro-logo" initial={{ y: 20 }} animate={{ y: [20, 0, -6, 0] }} transition={{ duration: 2.2, times: [0, 0.4, 0.7, 1] }}>
          <Logo size={132} animated />
        </motion.div>

        <h1 className="intro-title" aria-label={NAME}>
          {NAME.split('').map((ch, i) => (
            <motion.span
              key={i}
              initial={{ y: 48, opacity: 0, rotate: -8 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ delay: 1 + i * 0.07, type: 'spring', stiffness: 260, damping: 18 }}
            >
              {ch}
            </motion.span>
          ))}
        </h1>

        <motion.p className="intro-tagline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.9, duration: 0.6 }}>
          {TAGLINE}
        </motion.p>

        <motion.div className="intro-progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: DURATION / 1000 - 0.3, ease: 'easeInOut' }} />
        </motion.div>
      </div>

      <button className="intro-skip" onClick={onDone}>Skip intro</button>
    </motion.div>
  );
}
