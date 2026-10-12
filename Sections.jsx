import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Landmark, Navigation, Clock, Accessibility, Leaf, Baby, Coins, Car, ParkingSquare, Bath, Utensils, Globe2,
  Info, Bus, ShieldCheck, HeartPulse, Hand, Wrench, MessageCircle, Wallet, BookOpen, ExternalLink,
} from 'lucide-react';
import { exploreUrl, fmtDist, walkMins, titleCase, directionsUrl } from '../../lib/api.js';

export function Section({ id, icon: Icon, title, subtitle, children, tint }) {
  return (
    <section id={id} className="dest-section" style={tint ? { '--tint': tint } : undefined}>
      <div className="dest-section-head">
        <span className="dest-section-icon"><Icon size={20} /></span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function StateBlock({ state, empty }) {
  if (state.loading) return <div className="list-skeleton">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton row" />)}</div>;
  if (state.error) return <p className="notice error">{state.error}</p>;
  if (!state.items?.length) return <p className="notice">{empty}</p>;
  return null;
}

const Dir = ({ from, to }) => (
  <a className="link-btn" href={directionsUrl(from, to)} target="_blank" rel="noreferrer">
    <Navigation size={14} /> Directions
  </a>
);

// ---------------- Attractions ----------------
export function Attractions({ state, center, city }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const block = StateBlock({ state, empty: 'No named attractions in this radius – try widening it.' });
  if (block) return block;
  const list = showAll ? state.items : state.items.slice(0, 12);
  return (
    <>
      <div className="attr-grid">
        {list.map((a, i) => (
          <motion.article
            key={a.id}
            className="attr-card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 10) * 0.03 }}
          >
            <button
              className="attr-img"
              style={a.image ? { backgroundImage: `url("${a.image}")` } : undefined}
              onClick={() => navigate(exploreUrl({ ...a, city }))}
              aria-label={`Explore ${a.name}`}
            >
              {!a.image && <Landmark size={30} />}
              <span className="chip chip-float">{titleCase(a.category)}</span>
            </button>
            <div className="attr-body">
              <h3>{a.name}</h3>
              <p className="meta">
                <span>{fmtDist(a.distance)} · ~{walkMins(a.distance)} min walk</span>
                {a.fee === 'no' && <span className="chip mint">Free entry</span>}
              </p>
              {a.openingHours && <p className="meta small"><Clock size={13} /> {a.openingHours}</p>}
              <div className="row-actions">
                <button className="link-btn" onClick={() => navigate(exploreUrl({ ...a, city }))}>Details</button>
                <Dir from={center} to={a} />
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      {state.items.length > 12 && (
        <button className="btn btn-soft center-btn" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show fewer' : `Show all ${state.items.length} attractions`}
        </button>
      )}
    </>
  );
}

// ---------------- Food by cuisine ----------------
const KIND_LABEL = { restaurant: 'Restaurant', cafe: 'Café', fast_food: 'Fast food', food_court: 'Food court', pub: 'Pub', bar: 'Bar', ice_cream: 'Ice cream' };

export function Food({ state, center }) {
  const [cuisine, setCuisine] = useState('all');
  const [veg, setVeg] = useState(false);
  const cuisines = state.cuisines || [];
  const list = useMemo(
    () =>
      (state.items || []).filter(
        (r) =>
          (cuisine === 'all' || (cuisine === 'other' ? !r.cuisines.length : r.cuisines.includes(cuisine))) &&
          (!veg || r.vegetarian || r.vegan),
      ),
    [state.items, cuisine, veg],
  );
  const block = StateBlock({ state, empty: 'No restaurants mapped in this radius yet.' });
  if (block) return block;

  // Nearest place for each of the top cuisines.
  const best = cuisines.slice(0, 8).filter((c) => c.name !== 'other').map((c) => ({ c, r: state.items.find((r) => r.cuisines.includes(c.name)) })).filter((x) => x.r);

  return (
    <>
      <div className="cuisine-best">
        {best.map(({ c, r }) => (
          <button key={c.name} className="cuisine-tile" onClick={() => setCuisine(c.name)}>
            <span className="cuisine-name">{titleCase(c.name)}</span>
            <strong>{r.name}</strong>
            <small>nearest · {fmtDist(r.distance)}</small>
          </button>
        ))}
      </div>

      <div className="chip-row">
        <button className={`chip-btn ${cuisine === 'all' ? 'on' : ''}`} onClick={() => setCuisine('all')}>All ({state.items.length})</button>
        {cuisines.slice(0, 18).map((c) => (
          <button key={c.name} className={`chip-btn ${cuisine === c.name ? 'on' : ''}`} onClick={() => setCuisine(c.name)}>
            {titleCase(c.name)} ({c.count})
          </button>
        ))}
        <button className={`chip-btn mint ${veg ? 'on' : ''}`} onClick={() => setVeg((v) => !v)}><Leaf size={13} /> Veg-friendly</button>
      </div>

      <ul className="poi-list">
        {list.slice(0, 40).map((r) => (
          <li key={r.id} className="poi">
            <span className="poi-icon peach"><Utensils size={16} /></span>
            <div className="poi-main">
              <strong>{r.name}</strong>
              <span className="meta small">
                {KIND_LABEL[r.kind] || 'Eatery'}
                {r.cuisines.length > 0 && ` · ${r.cuisines.map(titleCase).join(', ')}`}
                {r.openingHours && <> · <Clock size={12} /> {r.openingHours}</>}
              </span>
              <span className="tags">
                {r.vegetarian && <span className="chip mint">Vegetarian</span>}
                {r.vegan && <span className="chip mint">Vegan</span>}
                {r.wheelchair === 'yes' && <span className="chip sky"><Accessibility size={12} /> Accessible</span>}
              </span>
            </div>
            <div className="poi-side">
              <span className="dist">{fmtDist(r.distance)}</span>
              {r.website && <a className="link-btn" href={r.website} target="_blank" rel="noreferrer"><Globe2 size={14} /> Site</a>}
              <Dir from={center} to={r} />
            </div>
          </li>
        ))}
      </ul>
      {!list.length && <p className="notice">Nothing matches these filters.</p>}
    </>
  );
}

// ---------------- Washrooms ----------------
export function Washrooms({ state, center }) {
  const block = StateBlock({ state, empty: 'No public washrooms are mapped here. Cafés, malls and museums are your best bet.' });
  if (block) return block;
  return (
    <ul className="poi-list">
      {state.items.slice(0, 15).map((t, i) => (
        <li key={t.id} className={`poi ${i === 0 ? 'poi-highlight' : ''}`}>
          <span className="poi-icon mint"><Bath size={16} /></span>
          <div className="poi-main">
            <strong>{i === 0 ? `Nearest: ${t.name}` : t.name}</strong>
            <span className="tags">
              {t.fee === 'no' && <span className="chip mint">Free</span>}
              {t.fee === 'yes' && <span className="chip peach"><Coins size={12} /> Paid</span>}
              {t.wheelchair === 'yes' && <span className="chip sky"><Accessibility size={12} /> Wheelchair</span>}
              {t.changingTable && <span className="chip lilac"><Baby size={12} /> Baby change</span>}
              {t.unisex && <span className="chip">Unisex</span>}
              {t.openingHours && <span className="chip"><Clock size={12} /> {t.openingHours}</span>}
            </span>
          </div>
          <div className="poi-side">
            <span className="dist">{fmtDist(t.distance)}</span>
            <Dir from={center} to={t} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------- Parking ----------------
const PARK_TYPE = { surface: 'Open lot', 'multi-storey': 'Multi-storey', underground: 'Underground', street_side: 'Street-side', lane: 'On-street', rooftop: 'Rooftop', motorcycle: 'Motorcycle' };

export function Parking({ state, center }) {
  const block = StateBlock({ state, empty: 'No public parking mapped in this radius.' });
  if (block) return block;
  return (
    <ul className="poi-list">
      {state.items.slice(0, 15).map((p) => (
        <li key={p.id} className="poi">
          <span className="poi-icon sky">{p.parkingType === 'motorcycle' ? <ParkingSquare size={16} /> : <Car size={16} />}</span>
          <div className="poi-main">
            <strong>{p.name}</strong>
            <span className="tags">
              {p.parkingType && <span className="chip sky">{PARK_TYPE[p.parkingType] || titleCase(p.parkingType)}</span>}
              {p.fee === 'no' && <span className="chip mint">Free</span>}
              {p.fee === 'yes' && <span className="chip peach"><Coins size={12} /> Paid</span>}
              {p.capacity && <span className="chip">{p.capacity} spaces</span>}
              {p.openingHours && <span className="chip"><Clock size={12} /> {p.openingHours}</span>}
            </span>
          </div>
          <div className="poi-side">
            <span className="dist">{fmtDist(p.distance)}</span>
            <Dir from={center} to={p} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------- Tips ----------------
const TIP_ICONS = { info: Info, bus: Bus, shield: ShieldCheck, heart: HeartPulse, hand: Hand, wrench: Wrench, chat: MessageCircle, wallet: Wallet };
const TIP_TINTS = ['#e8ddff', '#dff4ff', '#e2f8ec', '#ffe3ec', '#fff2db'];

export function Tips({ tips = [], url }) {
  if (!tips.length)
    return (
      <p className="notice">
        No travel guide found for this spot yet. Tip: check opening hours the day before, carry water and a little local cash,
        and visit popular sights early in the morning.
      </p>
    );
  return (
    <>
      <div className="tips-grid">
        {tips.map((t, i) => {
          const Icon = TIP_ICONS[t.icon] || Info;
          return (
            <article key={t.label} className="tip-card" style={{ '--tint': TIP_TINTS[i % TIP_TINTS.length] }}>
              <h3><Icon size={17} /> {t.label}</h3>
              <p>{t.text}</p>
            </article>
          );
        })}
      </div>
      {url && <p className="source-note">Tips adapted from <a href={url} target="_blank" rel="noreferrer">Wikivoyage</a> (CC BY-SA 4.0).</p>}
    </>
  );
}

// ---------------- History / overview ----------------
export function History({ history, extract, wikiUrl }) {
  const [open, setOpen] = useState(false);
  const paras = history?.paragraphs || [];
  const shown = open ? paras : paras.slice(0, 2);
  return (
    <div className="history">
      {extract && <p className="history-lead">{extract}</p>}
      {paras.length > 0 && (
        <>
          <h3 className="history-heading"><BookOpen size={17} /> {history.heading || 'History'}</h3>
          {shown.map((p, i) => <p key={i}>{p}</p>)}
          {paras.length > 2 && (
            <button className="btn btn-soft" onClick={() => setOpen((o) => !o)}>{open ? 'Show less' : 'Read the full story'}</button>
          )}
        </>
      )}
      {!extract && !paras.length && <p className="notice">No historical write-up found for this place.</p>}
      {wikiUrl && (
        <p className="source-note">
          Source: <a href={wikiUrl} target="_blank" rel="noreferrer">Wikipedia <ExternalLink size={12} /></a> (CC BY-SA 4.0)
        </p>
      )}
    </div>
  );
}
