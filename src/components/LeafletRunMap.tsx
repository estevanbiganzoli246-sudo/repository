import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { GpsPoint } from '../types/run';

interface LeafletRunMapProps {
  routePoints: GpsPoint[];
  currentPoint?: GpsPoint | null;
  isLive?: boolean;
  className?: string;
  zoom?: number;
  interactive?: boolean;
}

export const LeafletRunMap: React.FC<LeafletRunMapProps> = ({
  routePoints,
  currentPoint,
  isLive = false,
  className = 'h-full w-full',
  zoom = 16,
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const finishMarkerRef = useRef<L.Marker | null>(null);
  const currentMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current) return;

    // Initial center
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
      attributionControl: false,
    });

    // Dark athletic tiles (CartoDB Dark Matter)
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 20,
      }
    ).addTo(map);

    // Initial polyline
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

    // Resize observer to ensure tiles fill the viewport
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

  // Update Polyline
  useEffect(() => {
    if (!polylineRef.current) return;
    const latLngs = routePoints.map((p) => [p.lat, p.lng] as [number, number]);
    polylineRef.current.setLatLngs(latLngs);
  }, [routePoints]);

  // Update Start & Finish markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean previous markers
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
    if (finishMarkerRef.current) {
      finishMarkerRef.current.remove();
      finishMarkerRef.current = null;
    }

    // 🟢 Start Marker (INICIO)
    if (routePoints.length > 0) {
      const startPt = routePoints[0];
      const startIcon = L.divIcon({
        className: 'custom-start-marker',
        html: `<div style="background-color:#10b981; color:#ffffff; font-weight:800; font-size:10px; width:28px; height:28px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.4);">IN</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      startMarkerRef.current = L.marker([startPt.lat, startPt.lng], {
        icon: startIcon,
        zIndexOffset: 100,
      }).addTo(map);
    }

    // 🔴 Finish Marker (FINAL) - when not live and >= 2 points
    if (!isLive && routePoints.length > 1) {
      const finishPt = routePoints[routePoints.length - 1];
      const finishIcon = L.divIcon({
        className: 'custom-finish-marker',
        html: `<div style="background-color:#ef4444; color:#ffffff; font-weight:800; font-size:10px; width:28px; height:28px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 6px -1px rgba(0,0,0,0.4);">FIN</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      finishMarkerRef.current = L.marker([finishPt.lat, finishPt.lng], {
        icon: finishIcon,
        zIndexOffset: 200,
      }).addTo(map);
    }
  }, [routePoints, isLive]);

  // Update Live Current Point Marker & Accuracy Circle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!isLive || !currentPoint) {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.remove();
        currentMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.remove();
        accuracyCircleRef.current = null;
      }
      return;
    }

    // Live Runner Pulsing Marker
    if (!currentMarkerRef.current) {
      const runnerIcon = L.divIcon({
        className: 'custom-runner-marker',
        html: `
          <div style="position:relative; width:32px; height:32px; display:flex; align-items:center; justify-content:center;">
            <div style="position:absolute; width:32px; height:32px; border-radius:50%; background-color:rgba(16,185,129,0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position:relative; width:16px; height:16px; border-radius:50%; background-color:#10b981; border:2.5px solid white; box-shadow:0 0 10px rgba(16,185,129,0.8);"></div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      currentMarkerRef.current = L.marker([currentPoint.lat, currentPoint.lng], {
        icon: runnerIcon,
        zIndexOffset: 500,
      }).addTo(map);
    } else {
      currentMarkerRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
    }

    // Accuracy Circle
    if (currentPoint.accuracy && currentPoint.accuracy > 0) {
      const radius = Math.min(currentPoint.accuracy, 80);
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle([currentPoint.lat, currentPoint.lng], {
          radius: radius,
          color: '#10b981',
          weight: 1,
          opacity: 0.4,
          fillColor: '#10b981',
          fillOpacity: 0.1,
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng([currentPoint.lat, currentPoint.lng]);
        accuracyCircleRef.current.setRadius(radius);
      }
    }

    // Smooth pan to current runner position during live tracking
    map.panTo([currentPoint.lat, currentPoint.lng], { animate: true, duration: 0.5 });
  }, [currentPoint, isLive]);

  // Fit bounds when finished or viewing completed route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isLive || routePoints.length < 2) return;

    const latLngs = routePoints.map((p) => [p.lat, p.lng] as [number, number]);
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  }, [routePoints, isLive]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map || !currentPoint) return;
    map.setView([currentPoint.lat, currentPoint.lng], 17, { animate: true });
  };

  return (
    <div className={`relative ${className} overflow-hidden rounded-2xl bg-neutral-900`}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Recenter button during live run */}
      {isLive && currentPoint && (
        <button
          type="button"
          onClick={handleRecenter}
          className="absolute bottom-4 right-4 z-[400] p-3 bg-neutral-900/90 text-white hover:bg-neutral-800 rounded-full shadow-lg border border-neutral-700/80 active:scale-95 transition"
          title="Centrar en mi ubicación"
        >
          <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" strokeWidth="2" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
          </svg>
        </button>
      )}
    </div>
  );
};
