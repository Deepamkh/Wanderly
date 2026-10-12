import { Radar } from 'lucide-react';
import { fmtDist } from '../../lib/api.js';

const STOPS = [500, 1000, 2000, 5000, 10000, 20000];

export default function RadiusControl({ value, onChange }) {
  // Slider runs on a log-ish scale through STOPS for fine control at short distances.
  const idx = (() => {
    for (let k = 0; k < STOPS.length - 1; k++) {
      if (value <= STOPS[k + 1]) return k + (value - STOPS[k]) / (STOPS[k + 1] - STOPS[k]);
    }
    return STOPS.length - 1;
  })();
  const fromIdx = (x) => {
    const k = Math.min(STOPS.length - 2, Math.floor(x));
    const v = STOPS[k] + (x - k) * (STOPS[k + 1] - STOPS[k]);
    return Math.round(v / 100) * 100;
  };

  return (
    <div className="radius-card">
      <div className="radius-top">
        <span className="radius-label"><Radar size={18} /> Search radius</span>
        <strong className="radius-value">{fmtDist(value)}</strong>
      </div>
      <input
        type="range"
        min={0}
        max={STOPS.length - 1}
        step={0.01}
        value={idx}
        onChange={(e) => onChange(fromIdx(Number(e.target.value)))}
        aria-label="Search radius"
        style={{ '--pct': `${(idx / (STOPS.length - 1)) * 100}%` }}
      />
      <div className="radius-stops">
        {STOPS.map((s) => (
          <button key={s} className={value === s ? 'on' : ''} onClick={() => onChange(s)}>{fmtDist(s)}</button>
        ))}
      </div>
    </div>
  );
}
