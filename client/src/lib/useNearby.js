import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

// Must match the server: one request per radius "bucket" covers every smaller radius,
// so moving the slider down never triggers a new request.
const BUCKETS = [1000, 2000, 5000, 10000, 20000];
// Attractions come from Wikipedia (max 10 km); food, washrooms and parking from OpenStreetMap.
export const CAPS = { attractions: 10000, food: 3000, toilets: 2000, parking: 3000 };
const AMENITY_KINDS = ['food', 'toilets', 'parking'];
const RETRY_DELAYS = [3000, 8000, 15000];

const bucketFor = (r) => BUCKETS.find((b) => b >= r) ?? BUCKETS[BUCKETS.length - 1];

function cuisineCounts(items) {
  const counts = {};
  for (const p of items) for (const c of p.cuisines.length ? p.cuisines : ['other']) counts[c] = (counts[c] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

/**
 * Fetch one area resource per (place, radius bucket) with automatic retries.
 * A smaller radius than one already loaded is served from what we have.
 */
function useAreaResource(fetcher, center, radius, maxRadius) {
  const bucket = radius ? Math.min(bucketFor(radius), maxRadius) : null;
  const areaKey = center ? `${center.lat},${center.lon}` : null;
  const [state, setState] = useState({ area: null, loading: true, error: null, data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => setAttempt(0), [areaKey]);

  useEffect(() => {
    if (!center || !bucket) return;
    const sameArea = state.area === areaKey && state.data;
    if (sameArea && state.data.radius >= bucket && !state.data.stale) return; // already covered

    let alive = true;
    setState((s) => ({ area: areaKey, loading: true, error: null, data: s.area === areaKey ? s.data : null }));
    fetcher(center.lat, center.lon, bucket)
      .then((data) => alive && setState({ area: areaKey, loading: false, error: null, data }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey, bucket, attempt]);

  useEffect(() => {
    if (!state.error || attempt >= RETRY_DELAYS.length) return;
    const t = setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAYS[attempt]);
    return () => clearTimeout(t);
  }, [state.error, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const retrying = !!state.error && attempt < RETRY_DELAYS.length;
  return { ...state, retrying, retry };
}

function view(res, items) {
  return {
    loading: (res.loading || res.retrying) && !res.data,
    error: res.data || res.retrying ? null : res.error,
    retry: res.retry,
    stale: !!res.data?.stale,
    items,
    count: items.length,
  };
}

/**
 * Attractions (Wikipedia, fast) and restaurants / washrooms / parking (OpenStreetMap) around a point.
 * The two load independently, so attractions show as soon as they're ready.
 * Returns { attractions, food, toilets, parking }, each { loading, error, retry, items, count, stale, cuisines? }.
 */
export function useNearbyAll(center, radius) {
  const attr = useAreaResource(api.attractions, center, radius, CAPS.attractions);
  const amen = useAreaResource(api.nearbyAll, center, radius, BUCKETS[BUCKETS.length - 1]);

  return useMemo(() => {
    const limit = (k) => Math.min(radius || 0, CAPS[k]);
    const out = {
      attractions: view(attr, (attr.data?.items || []).filter((p) => p.distance <= limit('attractions'))),
    };
    for (const k of AMENITY_KINDS) {
      out[k] = view(amen, (amen.data?.[k] || []).filter((p) => p.distance <= limit(k)));
      if (k === 'food') out[k].cuisines = cuisineCounts(out[k].items);
    }
    return out;
  }, [attr, amen, radius]);
}
