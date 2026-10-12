// Loads the Google Maps JavaScript API once (only used for the Google reviews widget).
// The key is public by design: restrict it to your website's domains in Google Cloud Console.
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

let loading = null;
const authListeners = new Set();

/** Called by Google when the key is invalid, restricted or billing is off. */
export function onGoogleAuthFailure(fn) {
  authListeners.add(fn);
  return () => authListeners.delete(fn);
}

export function loadGoogleMaps() {
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error('No Google Maps API key configured'));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    window.gm_authFailure = () => authListeners.forEach((fn) => fn());
    window.__wanderlyGoogleReady = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({
      key: GOOGLE_MAPS_KEY,
      v: 'weekly',
      loading: 'async',
      callback: '__wanderlyGoogleReady',
    })}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load Google Maps'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
