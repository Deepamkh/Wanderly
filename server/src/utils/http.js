// Small fetch helper with an in-memory TTL cache, timeouts and polite User-Agent.
const UA = () =>
  process.env.USER_AGENT || 'Wanderly/1.0 (open-source travel app; https://github.com/your-org/wanderly)';

const cache = new Map();
const MAX_ENTRIES = 3000;

function combineSignals(signals) {
  const list = signals.filter(Boolean);
  if (list.length <= 1) return list[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list);
  const ctrl = new AbortController();
  for (const s of list) {
    if (s.aborted) ctrl.abort(s.reason);
    else s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

export async function fetchJson(url, { method = 'GET', body, headers = {}, ttl = 3_600_000, timeout = 25_000, beforeNetwork, signal } = {}) {
  const key = `${method} ${url} ${body ?? ''}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;

  if (beforeNetwork) await beforeNetwork();

  const res = await fetch(url, {
    method,
    body,
    headers: { 'User-Agent': UA(), Accept: 'application/json', ...headers },
    signal: combineSignals([AbortSignal.timeout(timeout), signal]),
  });
  if (!res.ok) {
    const err = new Error(`Upstream ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (ttl > 0) {
    cache.set(key, { data, exp: Date.now() + ttl });
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  }
  return data;
}

/** Great-circle distance in metres. */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Bearing (0-360°) from point 1 to point 2. */
export function bearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Serialises calls so that at most one runs every `intervalMs` (e.g. Nominatim's 1 req/s policy). */
export function createRateGate(intervalMs) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + intervalMs;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  };
}

/** Limits concurrency of async jobs (Overpass allows ~2 slots per IP). */
export function createLimiter(max) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      runNext();
    });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
