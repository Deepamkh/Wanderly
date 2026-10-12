import { useEffect, useRef, useState } from 'react';
import { GOOGLE_MAPS_KEY, loadGoogleMaps, onGoogleAuthFailure } from '../../lib/googleMaps.js';
import { haversineKm } from '../../lib/geo.js';

/**
 * Google rating + reviews for a place, using Google's official Places UI Kit widget.
 * (The UI Kit is the only Google option allowed next to a non-Google map like our OpenStreetMap one.)
 *
 * Falls back to `fallback` (the community reviews) when there is no API key, the key fails,
 * or Google has no matching place nearby.
 */
export default function GoogleReviews({ name, lat, lon, city, fallback }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState(GOOGLE_MAPS_KEY ? 'loading' : 'off'); // loading | ready | notfound | error | off

  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) return;
    let cancelled = false;
    let timer;
    setStatus('loading');
    hostRef.current?.replaceChildren();

    const fail = (s) => !cancelled && setStatus(s);
    const offAuth = onGoogleAuthFailure(() => fail('error'));

    (async () => {
      try {
        const maps = await loadGoogleMaps();
        const { Place } = await maps.importLibrary('places');

        // Find this place on Google (ID only), biased to our coordinates.
        const textQuery = city && !name.toLowerCase().includes(city.toLowerCase()) ? `${name}, ${city}` : name;
        const { places } = await Place.searchByText({
          textQuery,
          fields: ['id', 'location'],
          locationBias: { lat, lng: lon },
          maxResultCount: 1,
        });
        if (cancelled) return;
        const hit = places?.[0];
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
        details.addEventListener('gmp-error', () => fail('error'));
        details.addEventListener('gmp-requesterror', () => fail('error'));
        // Read the ref now: the container may have re-mounted while we were waiting on Google.
        if (!hostRef.current) return fail('error');
        hostRef.current.replaceChildren(details);
        // If the widget renders without firing gmp-load, show it anyway.
        timer = setTimeout(() => !cancelled && setStatus((s) => (s === 'loading' ? 'ready' : s)), 8000);
      } catch (e) {
        console.warn('[google reviews]', e.message);
        fail('error');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      offAuth();
    };
  }, [name, lat, lon, city]);

  if (status === 'off' || status === 'notfound' || status === 'error') {
    return (
      <>
        {status === 'notfound' && <p className="notice small">Google doesn’t list reviews for this spot yet. Here’s what Wanderly travellers say.</p>}
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
