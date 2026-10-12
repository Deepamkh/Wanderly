// Loads the Google Maps JavaScript API once (only used for the Google reviews widget).
// The key is public by design: restrict it to your website's domains in Google Cloud Console.
//
// Where the key comes from (first found wins):
//   1. VITE_GOOGLE_MAPS_API_KEY at build time (client/.env)
//   2. the server at runtime: GOOGLE_MAPS_API_KEY in server/.env or your host's environment variables
//      (no rebuild needed – just restart the server)
const BUILD_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

let keyPromise = null;
export function getGoogleKey() {
  if (BUILD_KEY) return Promise.resolve(BUILD_KEY);
  if (!keyPromise) {
    keyPromise = fetch(`${import.meta.env.VITE_API_URL || ''}/api/config`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((c) => c.googleMapsKey || '')
      .catch(() => '');
  }
  return keyPromise;
}

let loading = null;
let authFailed = false;
const authListeners = new Set();

/** Called by Google when the key is invalid, restricted to other sites, or billing / APIs are off. */
export function onGoogleAuthFailure(fn) {
  if (authFailed) queueMicrotask(fn);
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function loadGoogleMaps(key) {
  if (!key) return Promise.reject(new Error('No Google Maps API key configured'));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    window.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((fn) => fn());
    };
    window.__wanderlyGoogleReady = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({
      key,
      v: 'weekly',
      loading: 'async',
      callback: '__wanderlyGoogleReady',
    })}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load Google Maps (network or ad blocker)'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
