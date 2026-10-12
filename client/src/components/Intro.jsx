import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Logo from './Logo.jsx';

const NAME = 'Wanderly';
const TAGLINE = 'Every journey, one place.';

// Timeline (seconds): letters drop 0.2–0.9 · Earth falls onto the wordmark at 1.0 and bounces twice
// until ~2.5 · paper plane flies left → right 2.4–3.6 · tagline 3.0 · hand over to the app at 4.6.
const DROP_AT = 1.0;
const BOUNCE_FOR = 1.5;
const TIMES = [0, 0.36, 0.58, 0.76, 0.88, 1]; // fall · land · up · land · up · land
const DURATION = 4600;

export default function Intro({ onDone }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const t = setTimeout(onDone, reduce ? 1500 : DURATION);
    const onKey = (e) => (e.key === 'Escape' || e.key === 'Enter') && onDone();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [onDone, reduce]);

  const bounce = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4 } }
    : {
        initial: { y: -360, opacity: 0 },
        animate: {
          y: [-360, 0, -78, 0, -30, 0],
          opacity: [0, 1, 1, 1, 1, 1],
          scaleY: [1.06, 0.82, 1.05, 0.9, 1.02, 1],
          scaleX: [0.95, 1.14, 0.97, 1.07, 0.99, 1],
        },
        transition: { delay: DROP_AT, duration: BOUNCE_FOR, times: TIMES, ease: ['easeIn', 'easeOut', 'easeIn', 'easeOut', 'easeIn'] },
      };

  // The wordmark dips slightly each time the Earth lands on it.
  const dip = reduce
    ? {}
    : {
        animate: { y: [0, 0, 7, 0, 0, 3, 0] },
        transition: { delay: DROP_AT, duration: BOUNCE_FOR, times: [0, 0.35, 0.4, 0.5, 0.75, 0.79, 0.86] },
      };

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
        <motion.div className="intro-logo" style={{ transformOrigin: '50% 100%' }} {...bounce}>
          <Logo size={176} intro={!reduce} />
        </motion.div>

        <motion.h1 className="intro-title" aria-label={NAME} {...dip}>
          {NAME.split('').map((ch, i) => (
            <motion.span
              key={i}
              initial={{ y: 48, opacity: 0, rotate: -8 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.2 + i * 0.07, type: 'spring', stiffness: 260, damping: 18 }}
            >
              {ch}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p className="intro-tagline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0.3 : 3.0, duration: 0.6 }}>
          {TAGLINE}
        </motion.p>

        <motion.div className="intro-progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: (reduce ? 1500 : DURATION) / 1000 - 0.3, ease: 'easeInOut' }} />
        </motion.div>
      </div>
    </motion.div>
  );
}
