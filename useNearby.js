import { useEffect, useState } from 'react';
import { api } from './api.js';

/** Fetches OSM points of interest around a centre; debounced so dragging the radius slider is cheap. */
export function useNearby(center, radius, kind, delay = 500) {
  const [state, setState] = useState({ loading: true, items: [], error: null });

  useEffect(() => {
    if (!center || !radius) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    const t = setTimeout(() => {
      api
        .nearby(center.lat, center.lon, radius, kind)
        .then((d) => alive && setState({ loading: false, error: null, ...d }))
        .catch((e) => alive && setState({ loading: false, items: [], error: e.message }));
    }, delay);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [center?.lat, center?.lon, radius, kind, delay]);

  return state;
}
