// NASA Visible Earth imagery (public domain) – Day: "Blue Marble: Next Generation", Night: "Black Marble".
// Served from the free unpkg CDN by default; run `npm run textures` (client) to self-host them in /public/textures
// and set VITE_GLOBE_LOCAL=1, or point VITE_GLOBE_DAY / VITE_GLOBE_NIGHT at any NASA image URL.
const CDN = 'https://unpkg.com/three-globe/example/img';
const LOCAL = import.meta.env.VITE_GLOBE_LOCAL === '1';

export const TEX = {
  day: import.meta.env.VITE_GLOBE_DAY || (LOCAL ? '/textures/earth-blue-marble.jpg' : `${CDN}/earth-blue-marble.jpg`),
  night: import.meta.env.VITE_GLOBE_NIGHT || (LOCAL ? '/textures/earth-night.jpg' : `${CDN}/earth-night.jpg`),
  bump: LOCAL ? '/textures/earth-topology.png' : `${CDN}/earth-topology.png`,
};
