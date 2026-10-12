import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Landmark, Loader2 } from 'lucide-react';
import { api, exploreUrl } from '../lib/api.js';

export default function SearchBar({ large = false, placeholder = 'Search a city or attraction… e.g. “Kyoto” or “Colosseum”' }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef();

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      api
        .search(q.trim(), ctrl.signal)
        .then((r) => {
          setItems(r);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 380);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e) => !boxRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const go = (item) => {
    setOpen(false);
    if (item) navigate(exploreUrl(item));
    else if (q.trim()) navigate(`/explore?q=${encodeURIComponent(q.trim())}`);
    else navigate('/destinations'); // empty search → browse all 100 travel options
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className={`search ${large ? 'search-lg' : ''}`} ref={boxRef}>
      <form
        className="search-box"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(active >= 0 ? items[active] : null);
        }}
      >
        <Search size={large ? 22 : 18} className="search-icon" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={onKey}
          placeholder={placeholder}
          aria-label="Search destinations"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {loading && <Loader2 size={18} className="spin muted" />}
        <button type="submit" className="btn btn-primary">Explore</button>
      </form>

      {open && items.length > 0 && (
        <ul className="search-results" role="listbox">
          {items.map((it, i) => (
            <li
              key={it.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it)}
            >
              <span className="sr-icon">{it.isArea ? <MapPin size={16} /> : <Landmark size={16} />}</span>
              <span className="sr-text">
                <strong>{it.name}</strong>
                <small>{it.displayName}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
