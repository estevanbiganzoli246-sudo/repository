import { GpsPoint, KmSplit } from '../types/run';

/**
 * Calculates distance between two coordinates using the Haversine formula in kilometers.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Formats pace in seconds per km to M:SS /km, or -- if invalid or too slow/fast
 */
export function formatPace(secondsPerKm: number): string {
  if (
    !secondsPerKm ||
    isNaN(secondsPerKm) ||
    !isFinite(secondsPerKm) ||
    secondsPerKm <= 0 ||
    secondsPerKm > 1800 // slower than 30 min per km is stationary/walking
  ) {
    return '--';
  }

  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.floor(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

/**
 * Formats distance with 2 decimals
 */
export function formatDistance(distanceKm: number): string {
  if (isNaN(distanceKm) || distanceKm <= 0) return '0.00 km';
  return `${distanceKm.toFixed(2)} km`;
}

/**
 * Formats speed in km/h or -- if invalid or zero
 */
export function formatSpeed(kmh: number): string {
  if (isNaN(kmh) || kmh <= 0 || !isFinite(kmh)) return '--';
  return `${kmh.toFixed(1)} km/h`;
}

/**
 * Formats date into readable localized Spanish string
 */
export function formatDate(isoOrTimestamp: string | number): string {
  try {
    const date = new Date(isoOrTimestamp);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Fecha no disponible';
  }
}
