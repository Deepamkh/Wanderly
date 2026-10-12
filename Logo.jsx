import { useId } from 'react';
import { motion } from 'framer-motion';

/** Wanderly mark: pastel globe + flight path + paper plane. `animated` draws it in. */
export default function Logo({ size = 40, animated = false }) {
  const id = useId().replace(/:/g, '');
  const draw = (delay = 0) =>
    animated
      ? { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 1, delay, ease: 'easeInOut' } }
      : {};

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Wanderly logo">
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9f3d8" />
          <stop offset="1" stopColor="#a9c9ff" />
        </linearGradient>
      </defs>
      <motion.circle
        cx="30" cy="34" r="20" fill={`url(#g-${id})`}
        {...(animated ? { initial: { scale: 0 }, animate: { scale: 1 }, transition: { type: 'spring', stiffness: 140, damping: 12 } } : {})}
        style={{ transformOrigin: '30px 34px' }}
      />
      <g fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".9">
        <motion.path d="M10 34H50" {...draw(0.3)} />
        <motion.path d="M30 14C20 22 20 46 30 54" {...draw(0.4)} />
        <motion.path d="M30 14C40 22 40 46 30 54" {...draw(0.4)} />
        <motion.path d="M13.5 24.5C22 28 38 28 46.5 24.5" {...draw(0.5)} />
        <motion.path d="M13.5 43.5C22 40 38 40 46.5 43.5" {...draw(0.5)} />
      </g>
      <motion.path d="M7 47C3 26 26 5 50 12" fill="none" stroke="#ffb3c7" strokeWidth="2.4" strokeLinecap="round" {...draw(0.7)} />
      <motion.g
        {...(animated
          ? { initial: { x: -38, y: 30, opacity: 0, rotate: -30 }, animate: { x: 0, y: 0, opacity: 1, rotate: 0 }, transition: { delay: 0.9, duration: 0.9, ease: 'easeOut' } }
          : {})}
      >
        <path d="M47 5L62 8L52 19L50.5 12.5Z" fill="#d7b8ff" />
        <path d="M50.5 12.5L62 8" stroke="#fff" strokeWidth="1.2" />
      </motion.g>
    </svg>
  );
}
