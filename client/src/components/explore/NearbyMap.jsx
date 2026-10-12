import { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const LAYERS = {
  attractions: { label: 'Attractions', color: '#9b7be0', fill: '#d7b8ff' },
  food: { label: 'Food', color: '#e58a5b', fill: '#ffd8a8' },
  toilets: { label: 'Washrooms', color: '#3fae86', fill: '#b9f3d8' },
  parking: { label: 'Parking', color: '#4f86d9', fill: '#a9c9ff' },
};

function FitRadius({ center, radius }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLng(center.lat, center.lon).toBounds(radius * 2.1), { animate: true });
  }, [map, center.lat, center.lon, radius]);
  return null;
}

export default function NearbyMap({ center, radius, layers, visible, onToggle }) {
  return (
    <div className="map-card">
      <div className="map-toggles">
        {Object.entries(LAYERS).map(([k, l]) => (
          <button key={k} className={`toggle ${visible[k] ? 'on' : ''}`} style={{ '--c': l.color, '--f': l.fill }} onClick={() => onToggle(k)}>
            <span className="dot" /> {l.label} <small>{layers[k]?.length ?? 0}</small>
          </button>
        ))}
      </div>
      <MapContainer center={[center.lat, center.lon]} zoom={14} scrollWheelZoom={false} className="leaflet-box">
        {/* OpenStreetMap's own tiles: free, no API key, attribution required. Swap via VITE_TILE_URL. */}
        <TileLayer
          url={TILE_URL}
          attribution={TILE_ATTRIBUTION}
          className="pastel-tiles"
          maxZoom={19}
        />
        <FitRadius center={center} radius={radius} />
        <Circle center={[center.lat, center.lon]} radius={radius} pathOptions={{ color: '#c9a8ff', weight: 2, dashArray: '6 6', fillColor: '#efe6ff', fillOpacity: 0.25 }} />
        <CircleMarker center={[center.lat, center.lon]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#ff8fab', fillOpacity: 1 }}>
          <Tooltip>You are exploring here</Tooltip>
        </CircleMarker>
        {Object.entries(LAYERS).map(([k, l]) =>
          visible[k]
            ? (layers[k] || []).map((p) => (
                <CircleMarker key={`${k}-${p.id}`} center={[p.lat, p.lon]} radius={6} pathOptions={{ color: l.color, weight: 2, fillColor: l.fill, fillOpacity: 0.95 }}>
                  <Tooltip>
                    <strong>{p.name}</strong>
                    <br />
                    {l.label}
                  </Tooltip>
                </CircleMarker>
              ))
            : null,
        )}
      </MapContainer>
    </div>
  );
}
