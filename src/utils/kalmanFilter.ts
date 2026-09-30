/**
 * GPS Kalman Filter for smooth, highly accurate route tracking.
 * Filters out jitter, multipath reflections, and measurement noise
 * based on reported geolocation accuracy and elapsed time.
 */
export class GpsKalmanFilter {
  private minAccuracy = 1;
  private qMps = 3; // Estimated runner acceleration in meters/second^2
  private lat: number | null = null;
  private lng: number | null = null;
  private variance: number = -1;
  private timestamp: number = 0;

  constructor(qMps = 3) {
    this.qMps = qMps;
  }

  /**
   * Resets the filter state
   */
  reset(): void {
    this.lat = null;
    this.lng = null;
    this.variance = -1;
    this.timestamp = 0;
  }

  /**
   * Processes a new raw GPS reading and returns smoothed coordinates.
   */
  process(
    lat: number,
    lng: number,
    accuracy: number,
    timestamp: number
  ): { lat: number; lng: number; accuracy: number } {
    const safeAccuracy = Math.max(accuracy, this.minAccuracy);

    // Initial state
    if (this.variance < 0 || this.lat === null || this.lng === null) {
      this.lat = lat;
      this.lng = lng;
      this.variance = safeAccuracy * safeAccuracy;
      this.timestamp = timestamp;
      return { lat, lng, accuracy: safeAccuracy };
    }

    // Time delta in seconds
    const timeDelta = Math.max(0.1, (timestamp - this.timestamp) / 1000);
    this.timestamp = timestamp;

    // State covariance prediction: variance increases with time based on runner movement
    this.variance += timeDelta * this.qMps * this.qMps;

    // Kalman gain K = P / (P + R)
    const measurementVariance = safeAccuracy * safeAccuracy;
    const k = this.variance / (this.variance + measurementVariance);

    // Coordinate update
    this.lat += k * (lat - this.lat);
    this.lng += k * (lng - this.lng);

    // Covariance update: P = (1 - K) * P
    this.variance = (1 - k) * this.variance;

    const filteredAccuracy = Math.sqrt(this.variance);

    return {
      lat: Number(this.lat.toFixed(7)),
      lng: Number(this.lng.toFixed(7)),
      accuracy: Math.round(filteredAccuracy),
    };
  }
}
