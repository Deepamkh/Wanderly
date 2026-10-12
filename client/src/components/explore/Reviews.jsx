import { useEffect, useState } from 'react';
import { Star, ThumbsUp, Send } from 'lucide-react';
import { api } from '../../lib/api.js';

function Stars({ value, onChange, size = 18 }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="stars" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => onChange && setHover(n)}
          onClick={() => onChange?.(n)}
        >
          <Star size={size} className={(hover || value) >= n ? 'filled' : ''} />
        </button>
      ))}
    </span>
  );
}

export default function Reviews({ placeKey, placeName }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ author: '', rating: 0, title: '', text: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(null);
    api.reviews(placeKey).then(setData).catch(() => setData({ count: 0, reviews: [] }));
  }, [placeKey]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.rating) return setMsg({ type: 'error', text: 'Pick a star rating first.' });
    setBusy(true);
    try {
      setData(await api.addReview(placeKey, form));
      setForm({ author: form.author, rating: 0, title: '', text: '' });
      setMsg({ type: 'ok', text: 'Thanks! Your review is live.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const vote = async (id) => {
    try {
      setData(await api.helpful(placeKey, id));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="reviews">
      <div className="reviews-summary">
        {data?.count ? (
          <>
            <span className="big-score">{data.average.toFixed(1)}</span>
            <Stars value={Math.round(data.average)} />
            <span className="muted">{data.count} traveller review{data.count > 1 ? 's' : ''}</span>
          </>
        ) : (
          <span className="muted">No reviews yet for {placeName} – be the first to share your experience!</span>
        )}
      </div>

      <div className="reviews-layout">
        <ul className="review-list">
          {(data?.reviews || []).slice(0, 8).map((r) => (
            <li key={r.id} className="review">
              <div className="review-head">
                <span className="avatar">{r.author.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{r.author}</strong>
                  <small className="muted">{new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</small>
                </div>
                <Stars value={r.rating} size={14} />
              </div>
              {r.title && <h4>{r.title}</h4>}
              <p>{r.text}</p>
              <button className="link-btn" onClick={() => vote(r.id)}><ThumbsUp size={14} /> Helpful ({r.helpful})</button>
            </li>
          ))}
        </ul>

        <form className="review-form" onSubmit={submit}>
          <h3>Write a review</h3>
          <Stars value={form.rating} onChange={(rating) => setForm({ ...form, rating })} size={24} />
          <input placeholder="Your name (optional)" value={form.author} maxLength={40} onChange={(e) => setForm({ ...form, author: e.target.value })} />
          <input placeholder="Title (optional)" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea placeholder="What should other travellers know?" rows={4} value={form.text} maxLength={1500} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          {msg && <p className={`notice ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</p>}
          <button className="btn btn-primary" disabled={busy}><Send size={16} /> {busy ? 'Posting…' : 'Post review'}</button>
        </form>
      </div>
    </div>
  );
}
