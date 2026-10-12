import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import { Moon, Sun, Pause, Play } from 'lucide-react';

// NASA Visible Earth imagery (public domain) – Day: "Blue Marble: Next Generation", Night: "Black Marble".
// Served from the free unpkg CDN by default; run `npm run textures` (client) to self-host them in /public/textures
// and set VITE_GLOBE_LOCAL=1, or point VITE_GLOBE_DAY / VITE_GLOBE_NIGHT at any NASA image URL.
const CDN = 'https://unpkg.com/three-globe/example/img';
const LOCAL = import.meta.env.VITE_GLOBE_LOCAL === '1';
const TEX = {
  day: import.meta.env.VITE_GLOBE_DAY || (LOCAL ? '/textures/earth-blue-marble.jpg' : `${CDN}/earth-blue-marble.jpg`),
  night: import.meta.env.VITE_GLOBE_NIGHT || (LOCAL ? '/textures/earth-night.jpg' : `${CDN}/earth-night.jpg`),
  bump: LOCAL ? '/textures/earth-topology.png' : `${CDN}/earth-topology.png`,
};

const ARC_COLORS = [
  ['#ffb3c7', '#d7b8ff'],
  ['#a9c9ff', '#b9f3d8'],
  ['#ffd8a8', '#ffb3c7'],
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default function GlobeView({ pins = [], focus, onSelect }) {
  const globeRef = useRef();
  const wrapRef = useRef();
  const onSelectRef = useRef(onSelect);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [mode, setMode] = useState('day');
  const [spinning, setSpinning] = useState(true);
  const [hover, setHover] = useState(null);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const setSpin = useCallback((on) => {
    const c = globeRef.current?.controls();
    if (c) c.autoRotate = on;
  }, []);

  const onReady = useCallback(() => {
    const g = globeRef.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.5;
    c.enableDamping = true;
    c.minDistance = 140;
    c.maxDistance = 520;
    g.pointOfView({ lat: 22, lng: 15, altitude: 2.4 }, 0);
  }, []);

  useEffect(() => setSpin(spinning && !focus && !hover), [spinning, focus, hover, setSpin]);

  useEffect(() => {
    if (focus && globeRef.current) globeRef.current.pointOfView({ lat: focus.lat, lng: focus.lon, altitude: 1.5 }, 1100);
  }, [focus]);

  const select = useCallback((d) => {
    setSpin(false);
    globeRef.current?.pointOfView({ lat: d.lat, lng: d.lon, altitude: 0.9 }, 900);
    setTimeout(() => onSelectRef.current?.(d), 850);
  }, [setSpin]);

  const makePin = useCallback(
    (d) => {
      const el = document.createElement('button');
      el.className = 'globe-pin';
      el.type = 'button';
      el.setAttribute('aria-label', `Explore ${d.name}`);
      el.innerHTML = `<span class="globe-pin-dot"></span><span class="globe-pin-label">${esc(d.name)}</span>`;
      el.style.pointerEvents = 'auto';
      el.onclick = (e) => {
        e.stopPropagation();
        select(d);
      };
      el.onmouseenter = () => setHover(d);
      el.onmouseleave = () => setHover((h) => (h === d ? null : h));
      return el;
    },
    [select],
  );

  // Decorative animated flight arcs hopping between pinned cities.
  const arcs = useMemo(() => {
    if (pins.length < 4) return [];
    const out = [];
    for (let i = 0; i < 14; i++) {
      const a = pins[(i * 7) % pins.length];
      const b = pins[(i * 11 + 5) % pins.length];
      if (a !== b) out.push({ a, b, color: ARC_COLORS[i % ARC_COLORS.length] });
    }
    return out;
  }, [pins]);

  return (
    <div className="globe-wrap" ref={wrapRef}>
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        onGlobeReady={onReady}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl={mode === 'day' ? TEX.day : TEX.night}
        bumpImageUrl={TEX.bump}
        showAtmosphere
        atmosphereColor="#d7c4ff"
        atmosphereAltitude={0.22}
        htmlElementsData={pins}
        htmlLat="lat"
        htmlLng="lon"
        htmlAltitude={0.012}
        htmlElement={makePin}
        ringsData={hover ? [hover] : []}
        ringLat="lat"
        ringLng="lon"
        ringColor={() => (t) => `rgba(255,179,199,${1 - t})`}
        ringMaxRadius={4.5}
        ringPropagationSpeed={2.5}
        ringRepeatPeriod={700}
        arcsData={arcs}
        arcStartLat={(d) => d.a.lat}
        arcStartLng={(d) => d.a.lon}
        arcEndLat={(d) => d.b.lat}
        arcEndLng={(d) => d.b.lon}
        arcColor="color"
        arcStroke={0.45}
        arcDashLength={0.35}
        arcDashGap={1.6}
        arcDashInitialGap={() => Math.random() * 2}
        arcDashAnimateTime={5200}
        arcAltitudeAutoScale={0.35}
        onGlobeClick={() => setSpinning(false)}
      />

      <div className="globe-controls">
        <button onClick={() => setMode((m) => (m === 'day' ? 'night' : 'day'))} title="Toggle NASA day / night imagery">
          {mode === 'day' ? <Moon size={16} /> : <Sun size={16} />} {mode === 'day' ? 'Night' : 'Day'}
        </button>
        <button onClick={() => setSpinning((s) => !s)} title="Toggle rotation">
          {spinning ? <Pause size={16} /> : <Play size={16} />} {spinning ? 'Pause' : 'Spin'}
        </button>
      </div>

      <div className={`globe-hovercard ${hover ? 'show' : ''}`} aria-live="polite">
        {hover && (
          <>
            <strong>{hover.name}</strong>
            <span>{hover.country}</span>
            <em>Must see: {hover.highlight}</em>
            <small>Click the pin to explore</small>
          </>
        )}
      </div>
      <p className="globe-credit">Imagery: NASA Visible Earth</p>
    </div>
  );
}
