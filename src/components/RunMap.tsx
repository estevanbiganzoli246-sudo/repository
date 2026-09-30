import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { GpsPoint } from '../types/run';

interface RunMapProps {
  routePoints: GpsPoint[];
  currentPoint?: GpsPoint | null;
  isLive?: boolean;
  className?: string;
  zoom?: number;
  interactive?: boolean;
}

export const RunMap: React.FC<RunMapProps> = ({
  routePoints,
  currentPoint,
  isLive = false,
  className = 'h-full w-full',
  zoom = 16,
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const finishMarkerRef = useRef<L.Marker | null>(null);
  const currentMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);

  // Map tile style: 'osm' (OpenStreetMap standard) or 'dark' (OSM Athletic Dark Mode via CSS filter)
  const [tileStyle, setTileStyle] = useState<'dark' | 'osm'>('osm');

  const getTileUrl = () => {
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  };

  // Initialize Leaflet Map with OpenStreetMap
  useEffect(() => {
    if (!containerRef.current) return;

    let initialLat = 40.4168;
    let initialLng = -3.7038;
    if (currentPoint) {
      initialLat = currentPoint.lat;
      initialLng = currentPoint.lng;
    } else if (routePoints.length > 0) {
      initialLat = routePoints[0].lat;
      initialLng = routePoints[0].lng;
    }

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLng],
      zoom: currentPoint || routePoints.length > 0 ? zoom : 14,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      attributionControl: true,
    });

    const tileUrl = getTileUrl();
    const attributionText = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    const tiles = L.tileLayer(tileUrl, {
      attribution: attributionText,
      maxZoom: 20,
      subdomains: 'abc',
    }).addTo(map);

    // Apply dark filter if dark style is active
    if (tileStyle === 'dark') {
      const container = tiles.getContainer();
      if (container) {
        container.style.filter = 'invert(100%) hue-rotate(180deg) brightness(92%) contrast(90%)';
      }
    }

    tileLayerRef.current = tiles;

    // Real GPS polyline (draws consecutive real coordinates with zero snap-to-road)
    const latLngs = routePoints.map((p) => [p.lat, p.lng] as [number, number]);
    const polyline = L.polyline(latLngs, {
      color: '#10b981',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    polylineRef.current = polyline;
    mapRef.current = map;

    // Invalidate size on container resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch Tile Layer / Dark filter when user toggles style
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }

    const tileUrl = getTileUrl();
    const attributionText = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    const tiles = L.tileLayer(tileUrl, {
      attribution: attributionText,
      maxZoom: 20,
      subdomains: 'abc',
    }).addTo(mapRef.current);

    if (tileStyle === 'dark') {
      const container = tiles.getContainer();
      if (container) {
        container.style.filter = 'invert(100%) hue-rotate(180deg) brightness(92%) contrast(90%)';
      }
    }

    tileLayerRef.current = tiles;
  }, [tileStyle]);

  // Update Route Polyline (including ida y vuelta accurately)
  useEffect(() => {
    if (!polylineRef.current) return;
    const latLngs = routePoints.map((p) => [p.lat, p.lng] as [number, number]);
    polylineRef.current.setLatLngs(latLngs);
  }, [routePoints]);

  // Update Start & Finish Markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Start marker (first point)
    if (routePoints.length > 0) {
      const first = routePoints[0];
      const startIcon = L.divIcon({
        className: 'start-marker-icon',
        html: `
          <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#10b981;border:3px solid #047857;box-shadow:0 0 10px rgba(16,185,129,0.7);color:#ffffff;font-size:10px;font-weight:900;">
            🟢
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      if (!startMarkerRef.current) {
        startMarkerRef.current = L.marker([first.lat, first.lng], { icon: startIcon }).addTo(map);
      } else {
        startMarkerRef.current.setLatLng([first.lat, first.lng]);
      }
    } else if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }

    // Finish marker (when completed and multiple points exist)
    if (!isLive && routePoints.length > 1) {
      const last = routePoints[routePoints.length - 1];
      const finishIcon = L.divIcon({
        className: 'finish-marker-icon',
        html: `
          <div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#ef4444;border:3px solid #b91c1c;box-shadow:0 0 10px rgba(239,68,68,0.7);color:#ffffff;font-size:10px;font-weight:900;">
            🏁
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      if (!finishMarkerRef.current) {
        finishMarkerRef.current = L.marker([last.lat, last.lng], { icon: finishIcon }).addTo(map);
      } else {
        finishMarkerRef.current.setLatLng([last.lat, last.lng]);
      }
    } else if (finishMarkerRef.current) {
      map.removeLayer(finishMarkerRef.current);
      finishMarkerRef.current = null;
    }
  }, [routePoints, isLive]);

  // Update Live Current Point and Real GPS Accuracy Circle
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (currentPoint) {
      const isWeakAccuracy = currentPoint.accuracy > 50;
      const coreColor = isWeakAccuracy ? '#f59e0b' : '#10b981';
      const shadowColor = isWeakAccuracy ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)';

      // Runner Live Marker Icon
      const currentIcon = L.divIcon({
        className: 'current-runner-icon',
        html: `
          <div style="position:relative;width:24px;height:24px;">
            <div style="position:absolute;inset:-6px;border-radius:50%;background:${shadowColor};animation:ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position:relative;width:24px;height:24px;border-radius:50%;background:${coreColor};border:3px solid #ffffff;box-shadow:0 0 12px ${coreColor};display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:10px;font-weight:bold;">
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      if (!currentMarkerRef.current) {
        currentMarkerRef.current = L.marker([currentPoint.lat, currentPoint.lng], {
          icon: currentIcon,
          zIndexOffset: 1000,
        }).addTo(map);
      } else {
        currentMarkerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
        currentMarkerRef.current.setIcon(currentIcon);
      }

      // Accuracy circle in real meters
      if (currentPoint.accuracy && currentPoint.accuracy > 0) {
        if (!accuracyCircleRef.current) {
          accuracyCircleRef.current = L.circle([currentPoint.lat, currentPoint.lng], {
            radius: currentPoint.accuracy,
            color: coreColor,
            fillColor: coreColor,
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: '3, 4',
          }).addTo(map);
        } else {
          accuracyCircleRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
          accuracyCircleRef.current.setRadius(currentPoint.accuracy);
          accuracyCircleRef.current.setStyle({
            color: coreColor,
            fillColor: coreColor,
          });
        }
      }

      // Pan to live runner position if active
      if (isLive) {
        map.panTo([currentPoint.lat, currentPoint.lng], { animate: true, duration: 0.5 });
      }
    } else {
      if (currentMarkerRef.current) {
        map.removeLayer(currentMarkerRef.current);
        currentMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        map.removeLayer(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
    }
  }, [currentPoint, isLive]);

  // Fit bounds when finished or reviewing completed route
  useEffect(() => {
    if (!mapRef.current || isLive || routePoints.length === 0) return;
    try {
      const bounds = L.latLngBounds(routePoints.map((p) => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    } catch (e) {
      console.warn('Could not fit map bounds:', e);
    }
  }, [routePoints, isLive]);

  const handleRecenter = () => {
    if (!mapRef.current) return;
    if (currentPoint) {
      mapRef.current.setView([currentPoint.lat, currentPoint.lng], zoom, { animate: true });
    } else if (routePoints.length > 0) {
      const bounds = L.latLngBounds(routePoints.map((p) => [p.lat, p.lng]));
      mapRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Leaflet container */}
      <div ref={containerRef} className="w-full h-full bg-neutral-950" />

      {/* Floating Map Controls */}
      <div className="absolute top-20 right-4 z-[400] flex flex-col gap-2">
        {/* Layer style toggle */}
        <button
          type="button"
          onClick={() => setTileStyle((prev) => (prev === 'dark' ? 'osm' : 'dark'))}
          className="p-2.5 rounded-xl bg-neutral-900/95 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 shadow-lg text-xs font-bold transition flex items-center gap-1.5 backdrop-blur-md"
          title="Cambiar capa de mapa OpenStreetMap"
        >
          <span>{tileStyle === 'dark' ? '🌙' : '🗺️'}</span>
          <span className="hidden sm:inline">
            {tileStyle === 'dark' ? 'OSM Oscuro' : 'OSM Estándar'}
          </span>
        </button>

        {/* Recenter button */}
        {(currentPoint || routePoints.length > 0) && (
          <button
            type="button"
            onClick={handleRecenter}
            className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/50 shadow-xl text-xs font-extrabold transition flex items-center gap-1.5 backdrop-blur-md active:scale-95"
            title="Centrar en mi ubicación actual"
          >
            <span className="text-sm">🎯</span>
            <span>Mi Ubicación</span>
          </button>
        )}
      </div>

      {/* OpenStreetMap Provider Badge */}
      <div className="absolute bottom-2 left-2 z-[400] px-2 py-0.5 rounded-md bg-neutral-950/80 border border-neutral-800 text-[10px] font-mono text-neutral-400 pointer-events-none backdrop-blur-sm">
        🗺️ MapLibre / OpenStreetMap
      </div>
    </div>
  );
};
