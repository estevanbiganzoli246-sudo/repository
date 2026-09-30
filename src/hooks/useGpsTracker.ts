import { useState, useRef, useEffect, useCallback } from 'react';
import { GpsPoint, KmSplit, RunTrackingStatus } from '../types/run';
import { calculateHaversineDistance } from '../utils/geo';

export type GpsQualityLevel = 'searching' | 'excellent' | 'good' | 'moderate' | 'weak';

const ACTIVE_RUN_STORAGE_KEY = 'runworld_active_run_cache';

interface CachedRunState {
  status: RunTrackingStatus;
  routePoints: GpsPoint[];
  distanceKm: number;
  durationSeconds: number;
  splits: KmSplit[];
  timestamp: number;
}

export function useGpsTracker() {
  const [status, setStatus] = useState<RunTrackingStatus>('idle');
  const [currentPoint, setCurrentPoint] = useState<GpsPoint | null>(null);
  const [routePoints, setRoutePoints] = useState<GpsPoint[]>([]);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number>(0);
  const [maxSpeedKmh, setMaxSpeedKmh] = useState<number>(0);
  const [splits, setSplits] = useState<KmSplit[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [recoveredRun, setRecoveredRun] = useState<CachedRunState | null>(null);

  // References for precise timing and state keeping
  const watchIdRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const accumulatedDurationRef = useRef<number>(0);
  const segmentStartTimeRef = useRef<number>(0);
  const routePointsRef = useRef<GpsPoint[]>([]);
  const lastSplitKmRef = useRef<number>(0);
  const lastSplitTimeRef = useRef<number>(0);

  // Screen Wake Lock reference to prevent screen suspension while running
  const wakeLockRef = useRef<any>(null);

  // Keep routePointsRef in sync with state
  useEffect(() => {
    routePointsRef.current = routePoints;
  }, [routePoints]);

  // Request Wake Lock to prevent phone from locking during a run
  const acquireWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch (err) {
      console.warn('Screen WakeLock not available or denied:', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (err) {
      console.warn('Error releasing WakeLock:', err);
    }
  }, []);

  // Re-acquire Wake Lock if app comes back to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (status === 'running' || status === 'searching_gps')) {
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [status, acquireWakeLock]);

  // Check for cached run on startup (< 4 hours old)
  useEffect(() => {
    try {
      const rawCache = localStorage.getItem(ACTIVE_RUN_STORAGE_KEY);
      if (rawCache) {
        const parsed: CachedRunState = JSON.parse(rawCache);
        const fourHoursMs = 4 * 60 * 60 * 1000;
        if (
          parsed &&
          Date.now() - parsed.timestamp < fourHoursMs &&
          parsed.routePoints &&
          parsed.routePoints.length > 0 &&
          parsed.status !== 'completed' &&
          parsed.status !== 'idle'
        ) {
          setRecoveredRun(parsed);
        } else {
          localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Error checking cached run:', e);
    }
  }, []);

  // Immediate Local Persistence: save state whenever routePoints or duration updates
  const persistActiveState = useCallback(
    (currentStatus: RunTrackingStatus, points: GpsPoint[], dist: number, dur: number, sp: KmSplit[]) => {
      if (currentStatus === 'idle' || currentStatus === 'completed') {
        localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
        return;
      }
      try {
        const stateToSave: CachedRunState = {
          status: currentStatus,
          routePoints: points,
          distanceKm: dist,
          durationSeconds: dur,
          splits: sp,
          timestamp: Date.now(),
        };
        localStorage.setItem(ACTIVE_RUN_STORAGE_KEY, JSON.stringify(stateToSave));
      } catch (err) {
        console.warn('Failed to save run state to localStorage:', err);
      }
    },
    []
  );

  // Handle GPS coordinate update
  const handlePositionUpdate = useCallback(
    (position: GeolocationPosition) => {
      const { latitude, longitude, altitude, accuracy, speed } = position.coords;
      const timestamp = position.timestamp || Date.now();

      // Precision GPS point object with raw coordinates
      const newPoint: GpsPoint = {
        lat: Number(latitude.toFixed(7)),
        lng: Number(longitude.toFixed(7)),
        altitude: altitude !== null && !isNaN(altitude) ? Number(altitude.toFixed(1)) : null,
        accuracy: Math.round(accuracy),
        speed: speed !== null && speed >= 0 ? Number(speed.toFixed(2)) : null,
        timestamp,
      };

      // Always update currentPoint so live marker reflects device position
      setCurrentPoint(newPoint);
      setGpsError(null);

      // Transition from searching to running once we get our first coordinate
      setStatus((prevStatus) => (prevStatus === 'searching_gps' ? 'running' : prevStatus));

      // RULE: Do not incorporate points with poor accuracy (> 50 meters) into the official route
      if (accuracy > 75) {
        return;
      }

      const points = routePointsRef.current;
      if (points.length === 0) {
        // First verified high-accuracy point: Start of run!
        const initialPoints = [newPoint];
        setRoutePoints(initialPoints);
        persistActiveState('running', initialPoints, 0, durationSeconds, splits);
        return;
      }

      // Check against the immediately preceding consecutive point (NOT older points)
      const lastPoint = points[points.length - 1];

      // Distance in km between the previous consecutive point and the new point
      const deltaKm = calculateHaversineDistance(
        lastPoint.lat,
        lastPoint.lng,
        newPoint.lat,
        newPoint.lng
      );

      const deltaTimeSeconds = Math.max(0.1, (timestamp - lastPoint.timestamp) / 1000);
      const deltaTimeHours = deltaTimeSeconds / 3600;

      // JITTER FILTER (when runner is resting / stationary):
      // Ignore tiny GPS wander (< 2.5 meters) when standing still
      if (deltaKm < 0.001) {
        return;
      }

      // OUTLIER / IMPOSSIBLE LEAP FILTER:
      // Human runner cannot travel faster than 36 km/h.
      if (deltaTimeHours > 0) {
        const calculatedSpeed = deltaKm / deltaTimeHours;
        if (calculatedSpeed > 36 || (deltaKm > 0.08 && deltaTimeSeconds < 3)) {
          console.warn('GPS jump detected & filtered:', {
            deltaKm,
            deltaTimeSeconds,
            calculatedSpeed,
          });
          return;
        }

        // Calculate and update current speed in km/h
        const speedKmh = speed && speed > 0 ? speed * 3.6 : calculatedSpeed;
        const boundedSpeed = Math.min(speedKmh, 35);
        setCurrentSpeedKmh(Number(boundedSpeed.toFixed(1)));
        setMaxSpeedKmh((prev) => Math.max(prev, Number(boundedSpeed.toFixed(1))));
      }

      // ACCUMULATE REAL DISTANCE CONSECUTIVELY:
      // Distance is P1 -> P2 + P2 -> P3 + ... + P(n-1) -> P(n)
      // This preserves both the outward leg AND the return leg (ida y vuelta)
      setDistanceKm((prevDistance) => {
        const updatedDistance = prevDistance + deltaKm;

        // Check for km split milestones (1 km, 2 km, 3 km...)
        const currentKmInt = Math.floor(updatedDistance);
        if (currentKmInt > lastSplitKmRef.current && currentKmInt >= 1) {
          const splitNumber = currentKmInt;
          const currentTotalElapsed =
            accumulatedDurationRef.current +
            (segmentStartTimeRef.current > 0
              ? Math.floor((Date.now() - segmentStartTimeRef.current) / 1000)
              : 0);

          const splitDuration = currentTotalElapsed - lastSplitTimeRef.current;
          const splitPace = splitDuration; // seconds for 1 km

          setSplits((prevSplits) => {
            const nextSplits = [
              ...prevSplits,
              {
                km: splitNumber,
                splitTimeSeconds: Math.max(1, splitDuration),
                totalElapsedSeconds: currentTotalElapsed,
                avgPaceSeconds: splitPace,
              },
            ];
            persistActiveState('running', [...points, newPoint], Number(updatedDistance.toFixed(3)), currentTotalElapsed, nextSplits);
            return nextSplits;
          });

          lastSplitKmRef.current = splitNumber;
          lastSplitTimeRef.current = currentTotalElapsed;
        }

        const finalDist = Number(updatedDistance.toFixed(3));
        persistActiveState('running', [...points, newPoint], finalDist, durationSeconds, splits);
        return finalDist;
      });

      // Append new point chronologically
      setRoutePoints((prev) => [...prev, newPoint]);
    },
    [durationSeconds, splits, persistActiveState]
  );

  const handlePositionError = useCallback((error: GeolocationPositionError) => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        setGpsError('Permiso de ubicación denegado. Activa el GPS para correr.');
        break;
      case error.POSITION_UNAVAILABLE:
        setGpsError('Señal de GPS no disponible en este momento.');
        break;
      case error.TIMEOUT:
        setGpsError('Optimizando señal GPS... Mantén la app abierta.');
        break;
      default:
        setGpsError('Buscando satélites GPS...');
    }
  }, []);

  // Timer runner for real-time stopwatch
  const startTimer = useCallback(() => {
    segmentStartTimeRef.current = Date.now();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    timerIntervalRef.current = window.setInterval(() => {
      if (segmentStartTimeRef.current > 0) {
        const elapsedSinceSegment = Math.floor((Date.now() - segmentStartTimeRef.current) / 1000);
        const total = accumulatedDurationRef.current + elapsedSinceSegment;
        setDurationSeconds(total);
      }
    }, 500);
  }, []);

  const pauseTimer = useCallback(() => {
    if (segmentStartTimeRef.current > 0) {
      const elapsedSinceSegment = Math.floor((Date.now() - segmentStartTimeRef.current) / 1000);
      accumulatedDurationRef.current += elapsedSinceSegment;
      segmentStartTimeRef.current = 0;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Force high-accuracy calibration / re-fix
  const calibrateGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsCalibrating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePositionUpdate(pos);
        setIsCalibrating(false);
      },
      () => {
        setIsCalibrating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  }, [handlePositionUpdate]);

  // Controls
  const startRunning = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('La geolocalización no está soportada por tu navegador o dispositivo.');
      return;
    }

    setGpsError(null);
    setStatus('searching_gps');
    setRoutePoints([]);
    setDistanceKm(0);
    setDurationSeconds(0);
    setCurrentSpeedKmh(0);
    setMaxSpeedKmh(0);
    setSplits([]);
    accumulatedDurationRef.current = 0;
    lastSplitKmRef.current = 0;
    lastSplitTimeRef.current = 0;

    acquireWakeLock();
    startTimer();

    // 1. Immediately request single high-accuracy position to warm up hardware GPS sensor
    navigator.geolocation.getCurrentPosition(
      handlePositionUpdate,
      (err) => {
        console.warn('Initial warm-up fix pending, continuing with watchPosition:', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    // 2. Continuous watch with high precision options
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, [handlePositionUpdate, handlePositionError, startTimer, acquireWakeLock]);

  const pauseRunning = useCallback(() => {
    setStatus('paused');
    pauseTimer();
    releaseWakeLock();
    persistActiveState('paused', routePointsRef.current, distanceKm, durationSeconds, splits);
  }, [pauseTimer, releaseWakeLock, persistActiveState, distanceKm, durationSeconds, splits]);

  const resumeRunning = useCallback(() => {
    setStatus('running');
    acquireWakeLock();
    startTimer();
    persistActiveState('running', routePointsRef.current, distanceKm, durationSeconds, splits);
  }, [startTimer, acquireWakeLock, persistActiveState, distanceKm, durationSeconds, splits]);

  const stopRunning = useCallback(() => {
    pauseTimer();
    releaseWakeLock();
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus('completed');
    localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
  }, [pauseTimer, releaseWakeLock]);

  const resetTracker = useCallback(() => {
    pauseTimer();
    releaseWakeLock();
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus('idle');
    setCurrentPoint(null);
    setRoutePoints([]);
    setDistanceKm(0);
    setDurationSeconds(0);
    setCurrentSpeedKmh(0);
    setMaxSpeedKmh(0);
    setSplits([]);
    setGpsError(null);
    accumulatedDurationRef.current = 0;
    segmentStartTimeRef.current = 0;
    lastSplitKmRef.current = 0;
    lastSplitTimeRef.current = 0;
    localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
    setRecoveredRun(null);
  }, [pauseTimer, releaseWakeLock]);

  // Resume a recovered run from localStorage
  const resumeRecoveredRun = useCallback(() => {
    if (!recoveredRun) return;
    setStatus('paused');
    setRoutePoints(recoveredRun.routePoints);
    routePointsRef.current = recoveredRun.routePoints;
    setDistanceKm(recoveredRun.distanceKm);
    setDurationSeconds(recoveredRun.durationSeconds);
    accumulatedDurationRef.current = recoveredRun.durationSeconds;
    setSplits(recoveredRun.splits || []);
    if (recoveredRun.routePoints.length > 0) {
      setCurrentPoint(recoveredRun.routePoints[recoveredRun.routePoints.length - 1]);
    }
    setRecoveredRun(null);
  }, [recoveredRun]);

  const discardRecoveredRun = useCallback(() => {
    localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY);
    setRecoveredRun(null);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  // Compute real average pace: seconds per km
  const avgPaceSecondsPerKm =
    distanceKm >= 0.05 && durationSeconds >= 5 ? durationSeconds / distanceKm : 0;

  // Compute real average speed: km / hours
  const avgSpeedKmh =
    durationSeconds > 0 && distanceKm > 0 ? distanceKm / (durationSeconds / 3600) : 0;

  // Determine quality level
  const accuracy = currentPoint?.accuracy ?? null;
  let qualityLevel: GpsQualityLevel = 'searching';
  if (status === 'searching_gps' || !currentPoint) {
    qualityLevel = 'searching';
  } else if (accuracy !== null) {
    if (accuracy <= 15) qualityLevel = 'excellent';
    else if (accuracy <= 30) qualityLevel = 'good';
    else if (accuracy <= 50) qualityLevel = 'moderate';
    else qualityLevel = 'weak';
  }

  return {
    status,
    currentPoint,
    routePoints,
    distanceKm,
    durationSeconds,
    currentSpeedKmh,
    avgSpeedKmh,
    maxSpeedKmh,
    avgPaceSecondsPerKm,
    splits,
    gpsError,
    qualityLevel,
    isCalibrating,
    recoveredRun,
    resumeRecoveredRun,
    discardRecoveredRun,
    calibrateGps,
    startRunning,
    pauseRunning,
    resumeRunning,
    stopRunning,
    resetTracker,
  };
}
