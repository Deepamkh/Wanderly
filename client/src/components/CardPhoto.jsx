import { useEffect, useState } from 'react';

/** Card photo that lazy-loads and falls back to `fallback` (or the card's tint) if it's missing or fails. */
export default function CardPhoto({ src, alt = '', fallback = null }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  if (!src || broken) return fallback;
  return <img className="card-photo" src={src} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}
