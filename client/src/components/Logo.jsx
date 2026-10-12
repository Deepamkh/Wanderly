import { TEX } from '../lib/textures.js';

// Flight path in a 64×64 box: starts low on the left, arcs over the Earth, ends high on the right.
const ARC = 'M3 46 C 2 18, 40 2, 61 16';
const scalePath = (d, k) => d.replace(/-?\d+(\.\d+)?/g, (n) => (Number(n) * k).toFixed(2));

/**
 * Wanderly mark: a slowly rotating Earth (real NASA Blue Marble imagery) with a paper plane
 * flying left → right along its orbit. `intro` plays the flight + trail-drawing animation once.
 */
export default function Logo({ size = 40, intro = false }) {
  return (
    <span className={`logo ${intro ? 'logo-intro' : ''}`} style={{ '--size': `${size}px` }} role="img" aria-label="Wanderly logo">
      <span className="logo-earth" style={{ backgroundImage: `url("${TEX.day}")` }} />
      <svg className="logo-orbit" viewBox="0 0 64 64" aria-hidden="true">
        <path className="logo-arc" d={ARC} pathLength="1" />
      </svg>
      <svg className="logo-plane" viewBox="0 0 24 24" aria-hidden="true" style={{ offsetPath: `path("${scalePath(ARC, size / 64)}")` }}>
        <path d="M2 4 L22 12 L2 20 L6.5 12 Z" fill="#d7b8ff" stroke="#9b7be0" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6.5 12 H22" stroke="#fff" strokeWidth="1.3" />
      </svg>
    </span>
  );
}
