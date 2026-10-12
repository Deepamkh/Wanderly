import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, CalendarDays, Users, Wallet, Gauge, Wand2, Printer, Copy, Landmark, Utensils, Footprints, Bus, Coffee, Cpu, Check } from 'lucide-react';
import { api } from '../lib/api.js';

const INTERESTS = [
  ['history', '🏛️ History'],
  ['art', '🎨 Art & museums'],
  ['food', '🍜 Food'],
  ['nature', '🌿 Nature'],
  ['culture', '🕌 Culture'],
  ['shopping', '🛍️ Shopping'],
  ['nightlife', '🌙 Nightlife'],
  ['family', '🧸 Family'],
  ['photography', '📸 Photo spots'],
  ['adventure', '🧗 Adventure'],
];

const TYPE_ICON = { sight: Landmark, food: Utensils, activity: Footprints, transport: Bus, rest: Coffee };

const LOADING_LINES = ['Reading the map…', 'Finding hidden gems…', 'Balancing your days…', 'Pencilling in lunch…', 'Packing the itinerary…'];

function toMarkdown(plan) {
  let s = `# ${plan.title}\n\n${plan.summary}\n\n`;
  for (const d of plan.days) {
    s += `## Day ${d.day}${d.date ? ` – ${d.date}` : ''}: ${d.theme}\n`;
    for (const it of d.items) s += `- **${it.time}** ${it.title} — ${it.description}\n`;
    s += '\n';
  }
  if (plan.tips?.length) s += `## Tips\n${plan.tips.map((t) => `- ${t}`).join('\n')}\n`;
  return s;
}

export default function Planner() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    destination: params.get('dest') || '',
    days: 3,
    startDate: '',
    travelers: 'couple',
    budget: 'moderate',
    pace: 'moderate',
    interests: ['history', 'food'],
    notes: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [line, setLine] = useState(0);
  const [error, setError] = useState(null);
  const [activeDay, setActiveDay] = useState(0);
  const [copied, setCopied] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggle = (k) =>
    setForm((f) => ({ ...f, interests: f.interests.includes(k) ? f.interests.filter((x) => x !== k) : [...f.interests, k] }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1600);
    try {
      const r = await api.plan(form);
      setResult(r);
      setActiveDay(0);
      setTimeout(() => document.getElementById('itinerary')?.scrollIntoView({ behavior: 'smooth' }), 80);
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(t);
      setLoading(false);
    }
  };

  const plan = result?.plan;
  const day = plan?.days[activeDay];

  return (
    <main className="page planner">
      <div className="planner-head">
        <span className="eyebrow"><Sparkles size={15} /> AI Trip Planner</span>
        <h1>Tell us your dream trip. <span className="grad-text">We’ll draw the map.</span></h1>
        <p className="muted">Powered by open-source AI models running for free – grounded with real places from OpenStreetMap.</p>
      </div>

      <form className="planner-form" onSubmit={submit}>
        <label className="field wide">
          <span>Where to?</span>
          <input required value={form.destination} onChange={set('destination')} placeholder="e.g. Lisbon, Portugal" />
        </label>
        <label className="field">
          <span><CalendarDays size={15} /> Days</span>
          <input type="number" min={1} max={14} value={form.days} onChange={set('days')} />
        </label>
        <label className="field">
          <span><CalendarDays size={15} /> Start date</span>
          <input type="date" value={form.startDate} onChange={set('startDate')} />
        </label>
        <label className="field">
          <span><Users size={15} /> Travellers</span>
          <select value={form.travelers} onChange={set('travelers')}>
            <option value="solo traveller">Solo</option>
            <option value="couple">Couple</option>
            <option value="family with kids">Family with kids</option>
            <option value="group of friends">Friends</option>
            <option value="seniors">Seniors</option>
          </select>
        </label>
        <label className="field">
          <span><Wallet size={15} /> Budget</span>
          <select value={form.budget} onChange={set('budget')}>
            <option value="shoestring">Shoestring</option>
            <option value="moderate">Moderate</option>
            <option value="luxury">Luxury</option>
          </select>
        </label>
        <label className="field">
          <span><Gauge size={15} /> Pace</span>
          <select value={form.pace} onChange={set('pace')}>
            <option value="relaxed">Relaxed</option>
            <option value="moderate">Balanced</option>
            <option value="packed">Packed</option>
          </select>
        </label>

        <div className="field wide">
          <span>Interests</span>
          <div className="chip-row">
            {INTERESTS.map(([k, label]) => (
              <button type="button" key={k} className={`chip-btn ${form.interests.includes(k) ? 'on' : ''}`} onClick={() => toggle(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="field wide">
          <span><Wand2 size={15} /> Anything else? (your prompt)</span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={set('notes')}
            placeholder="e.g. We love rooftop views, want one beach day, avoid long queues, vegetarian food please…"
          />
        </label>

        <button className="btn btn-primary btn-lg wide" disabled={loading}>
          <Sparkles size={18} /> {loading ? LOADING_LINES[line] : 'Generate my itinerary'}
        </button>
        {error && <p className="notice error wide">{error}</p>}
      </form>

      <AnimatePresence>
        {loading && (
          <motion.div className="plane-loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.span animate={{ x: ['-10%', '110%'], y: [0, -14, 0, 10, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>✈️</motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {plan && (
        <motion.section id="itinerary" className="itinerary" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
          <div className="itin-head">
            <div>
              <span className={`chip ${result.source === 'ai' ? 'lilac' : 'mint'}`}>
                <Cpu size={13} /> {result.source === 'ai' ? `AI generated · ${result.model || 'open model'}` : 'Smart planner (AI offline) · real OSM places'}
              </span>
              <h2>{plan.title}</h2>
              <p className="muted">{plan.summary}</p>
              {plan.budgetNote && <p className="small"><Wallet size={14} /> {plan.budgetNote}</p>}
            </div>
            <div className="itin-actions">
              <button
                className="btn btn-soft"
                onClick={() => {
                  navigator.clipboard?.writeText(toMarkdown(plan));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
              </button>
              <button className="btn btn-soft" onClick={() => window.print()}><Printer size={16} /> Print</button>
              <Link className="btn btn-soft" to={`/explore?q=${encodeURIComponent(plan.destination)}`}>Explore {plan.destination}</Link>
            </div>
          </div>

          <div className="day-tabs" role="tablist">
            {plan.days.map((d, i) => (
              <button key={d.day} role="tab" aria-selected={i === activeDay} className={i === activeDay ? 'on' : ''} onClick={() => setActiveDay(i)}>
                Day {d.day}
                {d.date && <small>{new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</small>}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {day && (
              <motion.div key={activeDay} className="day-panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3>{day.theme}</h3>
                <ol className="timeline">
                  {day.items.map((it, i) => {
                    const Icon = TYPE_ICON[it.type] || Footprints;
                    return (
                      <li key={i} className={`tl-item tl-${it.type}`}>
                        <span className="tl-time">{it.time}</span>
                        <span className="tl-dot"><Icon size={15} /></span>
                        <div className="tl-card">
                          <strong>{it.title}</strong>
                          <p>{it.description}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Print shows every day */}
          <div className="print-only">
            {plan.days.map((d) => (
              <div key={d.day}>
                <h3>Day {d.day}{d.date ? ` – ${d.date}` : ''}: {d.theme}</h3>
                <ul>{d.items.map((it, i) => <li key={i}><b>{it.time}</b> {it.title} — {it.description}</li>)}</ul>
              </div>
            ))}
          </div>

          {plan.tips?.length > 0 && (
            <div className="itin-tips">
              <h3>Trip tips</h3>
              <ul>{plan.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </motion.section>
      )}
    </main>
  );
}
