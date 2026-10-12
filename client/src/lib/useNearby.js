import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

// Must match the server: one request per radius "bucket" covers every smaller radius,
// so moving the slider down never triggers a new request.
const BUCKETS = [1000, 2000, 5000, 10000, 20000];
export const CAPS = { attractions: 20000, food: 3000, toilets: 2000, parking: 3000 };
const KINDS = ['attractions', 'food', 'toilets', 'parking'];
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
 * Attractions, food, washrooms and parking around a point, from a single API call.
 * Returns { attractions, food, toilets, parking }, each { loading, error, retry, items, count, stale, cuisines? }.
 */
export function useNearbyAll(center, radius) {
  const bucket = radius ? bucketFor(radius) : null;
  const areaKey = center ? `${center.lat},${center.lon}` : null;
  const [state, setState] = useState({ key: null, loading: true, error: null, data: null });
  const [attempt, setAttempt] = useState(0);

  // New place → start over.
  useEffect(() => setAttempt(0), [areaKey]);

  useEffect(() => {
    if (!center || !bucket) return;
    const reqKey = `${areaKey}|${bucket}`;
    // Already have a bigger area for this spot? Nothing to fetch.
    if (state.key?.startsWith(`${areaKey}|`) && state.data && state.data.radius >= bucket && !state.data.stale) return;

    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null, data: s.key?.startsWith(`${areaKey}|`) ? s.data : null }));
    const t = setTimeout(() => {
      api
        .nearbyAll(center.lat, center.lon, bucket)
        .then((data) => alive && setState({ key: reqKey, loading: false, error: null, data }))
        .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e.message })));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaKey, bucket, attempt]);

  // Places show straight away; attraction photos are fetched separately and merged in when ready.
  useEffect(() => {
    const d = state.data;
    if (!d || d.photosMerged || !d.attractions?.length || d.attractions.every((p) => p.image)) return;
    let alive = true;
    api
      .attractionPhotos(d.center.lat, d.center.lon, d.radius)
      .then(({ photos }) => {
        if (!alive) return;
        setState((s) =>
          s.data !== d
            ? s
            : {
                ...s,
                data: { ...d, photosMerged: true, attractions: d.attractions.map((p) => (photos[p.id] ? { ...p, ...photos[p.id] } : p)) },
              },
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [state.data]);

  // Automatic retries with back-off when the free servers are busy.
  useEffect(() => {
    if (!state.error || attempt >= RETRY_DELAYS.length) return;
    const t = setTimeout(() => setAttempt((a) => a + 1), RETRY_DELAYS[attempt]);
    return () => clearTimeout(t);
  }, [state.error, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return useMemo(() => {
    const out = {};
    const retrying = state.error && attempt < RETRY_DELAYS.length;
    for (const k of KINDS) {
      const limit = Math.min(radius || 0, CAPS[k]);
      const items = (state.data?.[k] || []).filter((p) => p.distance <= limit);
      out[k] = {
        loading: (state.loading || retrying) && !state.data,
        error: state.data || retrying ? null : state.error,
        retry,
        stale: !!state.data?.stale,
        items,
        count: items.length,
      };
      if (k === 'food') out[k].cuisines = cuisineCounts(items);
    }
    return out;
  }, [state, radius, attempt, retry]);
}
