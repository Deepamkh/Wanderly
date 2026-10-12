import { useEffect, useRef, useState } from 'react';
import { getGoogleKey, loadGoogleMaps, onGoogleAuthFailure } from '../../lib/googleMaps.js';
import { haversineKm } from '../../lib/geo.js';

// Why Google reviews aren't showing, in plain words (shown above the fallback reviews).
const REASONS = {
  nokey: 'Google reviews aren’t switched on yet: no Google Maps API key is set on the server (GOOGLE_MAPS_API_KEY).',
  auth: 'Google rejected the API key. Check that billing is on, that Maps JavaScript API, Places API (New) and Places UI Kit are enabled, and that the key allows this website’s address.',
  script: 'Google Maps couldn’t load in this browser (network issue or an ad/tracker blocker).',
  places: 'Google couldn’t search for this place. Make sure Places API (New) is enabled for the key.',
  notfound: 'Google doesn’t list this spot, so here’s what Wanderly travellers say.',
  widget: 'Google’s reviews widget failed to load. Make sure Places UI Kit is enabled for the key.',
};

/**
 * Google rating + reviews for a place, using Google's official Places UI Kit widget
 * (the only Google option allowed next to a non-Google map like our OpenStreetMap one).
 * Falls back to `fallback` (community reviews) and says why when Google isn't available.
 */
export default function GoogleReviews({ name, lat, lon, city, fallback }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | unavailable
  const [reason, setReason] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    setStatus('loading');
    setReason(null);
    hostRef.current?.replaceChildren();

    const fail = (why, err) => {
      if (cancelled) return;
      if (err) console.warn(`[google reviews] ${why}:`, err?.message || err);
      setReason(why);
      setStatus('unavailable');
    };
    const offAuth = onGoogleAuthFailure(() => fail('auth'));

    (async () => {
      const key = await getGoogleKey();
      if (cancelled) return;
      if (!key) return fail('nokey');

      let maps;
      try {
        maps = await loadGoogleMaps(key);
      } catch (e) {
        return fail('script', e);
      }

      let hit;
      try {
        const { Place } = await maps.importLibrary('places');
        const textQuery = city && !name.toLowerCase().includes(city.toLowerCase()) ? `${name}, ${city}` : name;
        const { places } = await Place.searchByText({
          textQuery,
          fields: ['id', 'location'],
          locationBias: { lat, lng: lon },
          maxResultCount: 1,
        });
        hit = places?.[0];
      } catch (e) {
        return fail('places', e);
      }
      if (cancelled) return;
      const loc = hit?.location;
      if (!hit || (loc && haversineKm(lat, lon, loc.lat(), loc.lng()) > 30)) return fail('notfound');

      // <gmp-place-details> with rating + reviews + Google attribution.
      const details = document.createElement('gmp-place-details');
      const request = document.createElement('gmp-place-details-place-request');
      request.setAttribute('place', hit.id);
      const config = document.createElement('gmp-place-content-config');
      config.append(document.createElement('gmp-place-rating'), document.createElement('gmp-place-reviews'));
      const attribution = document.createElement('gmp-place-attribution');
      attribution.setAttribute('light-scheme-color', 'gray');
      attribution.setAttribute('dark-scheme-color', 'white');
      config.append(attribution);
      details.append(request, config);

      details.addEventListener('gmp-load', () => !cancelled && setStatus('ready'));
      details.addEventListener('gmp-error', (e) => fail('widget', e));
      details.addEventListener('gmp-requesterror', (e) => fail('widget', e));
      if (!hostRef.current) return fail('widget', 'container missing');
      hostRef.current.replaceChildren(details);
      // If the widget renders without firing gmp-load, show it anyway.
      timer = setTimeout(() => !cancelled && setStatus((s) => (s === 'loading' ? 'ready' : s)), 8000);
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      offAuth();
    };
  }, [name, lat, lon, city]);

  if (status === 'unavailable') {
    return (
      <>
        <p className={`notice small ${reason === 'notfound' ? '' : 'warn'}`}>{REASONS[reason] || REASONS.widget}</p>
        {fallback}
      </>
    );
  }

  return (
    <div className="google-reviews">
      {status === 'loading' && (
        <div className="list-skeleton" aria-label="Loading Google reviews">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton row tall" />)}
        </div>
      )}
      <div ref={hostRef} className={`google-reviews-host ${status === 'loading' ? 'is-loading' : ''}`} />
    </div>
  );
}
