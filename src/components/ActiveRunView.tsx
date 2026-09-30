import React, { useState } from 'react';
import { RunMap } from './RunMap';
import { GpsPoint } from '../types/run';
import { formatDistance, formatDuration, formatPace, formatSpeed } from '../utils/geo';
import { GpsQualityLevel } from '../hooks/useGpsTracker';

interface ActiveRunViewProps {
  status: 'idle' | 'searching_gps' | 'running' | 'paused' | 'completed';
  currentPoint: GpsPoint | null;
  routePoints: GpsPoint[];
  distanceKm: number;
  durationSeconds: number;
  currentSpeedKmh: number;
  avgPaceSecondsPerKm: number;
  gpsError: string | null;
  qualityLevel?: GpsQualityLevel;
  isCalibrating?: boolean;
  onCalibrateGps?: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
}

export const ActiveRunView: React.FC<ActiveRunViewProps> = ({
  status,
  currentPoint,
  routePoints,
  distanceKm,
  durationSeconds,
  currentSpeedKmh,
  avgPaceSecondsPerKm,
  gpsError,
  qualityLevel = 'good',
  isCalibrating = false,
  onCalibrateGps,
  onPause,
  onResume,
  onStop,
  onCancel,
}) => {
  const [showConfirmFinish, setShowConfirmFinish] = useState(false);
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  const accuracy = currentPoint?.accuracy ?? null;
  const isWeak = qualityLevel === 'weak' || (accuracy !== null && accuracy > 50);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-neutral-950 flex flex-col justify-between select-none">
        {/* Top Header Overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 sm:p-5 bg-gradient-to-b from-neutral-950/95 via-neutral-950/70 to-transparent flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-emerald-400 font-black shadow-md">
            RW
          </div>
          <div>
            <div className="flex items-center gap-2">
              {status === 'searching_gps' && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  Conectando satélites...
                </div>
              )}
              {status === 'running' && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    EN CARRERA
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    ⚡ Anti-bloqueo activo
                  </span>
                </div>
              )}
              {status === 'paused' && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  ⏸️ PAUSADO
                </div>
              )}
            </div>

            {/* GPS Signal Status Badge */}
            <div className="text-[11px] font-mono mt-0.5 flex items-center gap-1.5">
              {status === 'searching_gps' ? (
                <span className="text-amber-400/90 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                  Buscando GPS...
                </span>
              ) : qualityLevel === 'excellent' ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>GPS Alta Precisión</span>
                  <span className="text-neutral-400">(±{Math.round(accuracy || 0)}m)</span>
                </span>
              ) : qualityLevel === 'good' ? (
                <span className="text-emerald-400/90 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>GPS Preciso</span>
                  <span className="text-neutral-400">(±{Math.round(accuracy || 0)}m)</span>
                </span>
              ) : qualityLevel === 'moderate' ? (
                <span className="text-amber-400 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>GPS Moderado</span>
                  <span className="text-neutral-400">(±{Math.round(accuracy || 0)}m)</span>
                </span>
              ) : (
                <span className="text-orange-400 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                  <span>Señal Débil (±{Math.round(accuracy || 0)}m)</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right buttons: Calibrate GPS & Discard */}
        <div className="flex items-center gap-2">
          {onCalibrateGps && (
            <button
              onClick={onCalibrateGps}
              disabled={isCalibrating}
              className="px-3 py-1.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-emerald-400 border border-neutral-800 text-xs font-semibold transition backdrop-blur shadow-sm flex items-center gap-1 disabled:opacity-50"
              title="Forzar calibración satelital instantánea"
            >
              <svg className={`w-3.5 h-3.5 ${isCalibrating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
              </svg>
              <span className="hidden sm:inline">{isCalibrating ? 'Calibrando...' : 'Calibrar GPS'}</span>
            </button>
          )}

          <button
            onClick={() => setShowConfirmCancel(true)}
            className="px-3.5 py-1.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 text-xs font-semibold transition backdrop-blur shadow-sm"
          >
            Descartar
          </button>
        </div>
      </div>

      {/* Weak GPS Warning Banner (if accuracy > 50m) */}
      {isWeak && status !== 'searching_gps' && (
        <div className="absolute top-20 left-4 right-4 z-30 p-2.5 bg-amber-950/90 border border-amber-500/50 rounded-2xl text-amber-200 text-xs shadow-lg backdrop-blur-md flex items-center gap-2">
          <span className="text-base flex-shrink-0">🛰️</span>
          <div className="flex-1">
            <span className="font-bold text-amber-300">Precisión GPS baja (±{Math.round(accuracy || 0)}m): </span>
            <span className="text-amber-200/90">
              Descartando puntos inexactos para proteger tu ruta real de saltos falsos. Para máxima precisión mantén visibilidad directa al cielo.
            </span>
          </div>
        </div>
      )}

      {/* GPS Error Banner */}
      {gpsError && (
        <div className="absolute top-20 left-4 right-4 z-30 p-3 bg-red-950/90 border border-red-500/50 rounded-2xl text-red-200 text-xs shadow-lg backdrop-blur-md flex items-center gap-2">
          <span className="text-base flex-shrink-0">❌</span>
          <span className="flex-1">{gpsError}</span>
        </div>
      )}

      {/* Center Interactive Real Map with live marker and polyline */}
      <div className="flex-1 min-h-0 w-full relative h-full">
        <RunMap
          routePoints={routePoints}
          currentPoint={currentPoint}
          isLive={true}
          className="h-full w-full"
        />

        {/* Searching GPS Overlay Screen */}
        {status === 'searching_gps' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-neutral-950/70 backdrop-blur-sm pointer-events-none">
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 text-center max-w-xs shadow-2xl space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white">Adquiriendo señal GPS...</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Conectando con satélites para obtener tu ubicación con la mayor precisión disponible.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Metrics HUD & Runner Controls */}
      <div className="flex-shrink-0 relative z-40 bg-neutral-950 border-t-2 border-emerald-500/40 p-5 sm:p-6 shadow-[0_-15px_35px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        {/* Main Distance Counter */}
        <div className="text-center mb-5">
          <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-0.5">
            DISTANCIA
          </div>
          <div className="text-5xl sm:text-6xl font-black font-mono tracking-tight text-white">
            {status === 'searching_gps' && routePoints.length === 0 ? (
              <span className="text-neutral-500">--</span>
            ) : (
              <>
                {distanceKm.toFixed(2)}
                <span className="text-xl sm:text-2xl font-bold text-emerald-400 ml-2 font-sans">
                  km
                </span>
              </>
            )}
          </div>
        </div>

        {/* Real Secondary Metrics: TIEMPO, RITMO, VELOCIDAD */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 p-3.5 rounded-2xl bg-neutral-900/70 border border-neutral-800/80 shadow-inner">
          {/* Real Stopwatch Time */}
          <div className="text-center">
            <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
              TIEMPO
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-white">
              {formatDuration(durationSeconds)}
            </div>
          </div>

          {/* Real Pace (starts at --) */}
          <div className="text-center border-x border-neutral-800">
            <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
              RITMO
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400">
              {formatPace(avgPaceSecondsPerKm)}
            </div>
          </div>

          {/* Real Speed */}
          <div className="text-center">
            <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
              VELOCIDAD
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-white">
              {status === 'searching_gps' ? '--' : formatSpeed(currentSpeedKmh)}
            </div>
          </div>
        </div>

        {/* Action Controls: PAUSAR, CONTINUAR, FINALIZAR */}
        <div className="max-w-md mx-auto">
          {status === 'running' || status === 'searching_gps' ? (
            <button
              onClick={onPause}
              className="w-full py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-lg transition shadow-lg shadow-amber-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
              <span>PAUSAR</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Continuar button */}
              <button
                onClick={onResume}
                className="py-4 px-3 sm:px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-sm sm:text-base transition shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-1.5"
              >
                <svg className="w-5 h-5 fill-current flex-shrink-0" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span className="truncate">CONTINUAR</span>
              </button>

              {/* Finalizar button */}
              <button
                onClick={() => setShowConfirmFinish(true)}
                className="py-4 px-3 sm:px-5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm sm:text-base transition shadow-lg shadow-rose-600/20 active:scale-95 flex items-center justify-center gap-1.5"
              >
                <svg className="w-5 h-5 fill-current flex-shrink-0" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                <span className="truncate">FINALIZAR</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal: Finalizar Carrera */}
      {showConfirmFinish && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-neutral-950/90 backdrop-blur-md">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 text-2xl font-bold">
              🛑
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">¿Finalizar esta carrera?</h3>
              <p className="text-sm text-neutral-400 mt-1">
                Se guardará tu entrenamiento con {formatDistance(distanceKm)} recorridos en {formatDuration(durationSeconds)}.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setShowConfirmFinish(false);
                  onStop();
                }}
                className="w-full py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-base transition active:scale-98 shadow-lg shadow-rose-600/20"
              >
                Finalizar y Guardar
              </button>
              <button
                onClick={() => setShowConfirmFinish(false)}
                className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-sm transition"
              >
                Seguir corriendo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Descartar Carrera */}
      {showConfirmCancel && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-neutral-950/90 backdrop-blur-md">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 text-2xl font-bold">
              ⚠️
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">¿Descartar entrenamiento?</h3>
              <p className="text-sm text-neutral-400 mt-1">
                Se cancelará la sesión actual y no se guardará ningún dato en tu historial.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setShowConfirmCancel(false);
                  onCancel();
                }}
                className="w-full py-3.5 rounded-xl bg-neutral-800 hover:bg-rose-600 text-white font-bold text-base transition"
              >
                Descartar Carrera
              </button>
              <button
                onClick={() => setShowConfirmCancel(false)}
                className="w-full py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-semibold text-sm border border-neutral-700 transition"
              >
                Seguir corriendo
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Confirmation Modal: Finalizar Carrera */}
      {showConfirmFinish && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-neutral-950/95 backdrop-blur-md pointer-events-auto">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 text-2xl font-bold">
              🛑
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">¿Finalizar esta carrera?</h3>
              <p className="text-sm text-neutral-400 mt-1">
                Se guardará tu entrenamiento con {formatDistance(distanceKm)} recorridos en {formatDuration(durationSeconds)}.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setShowConfirmFinish(false);
                  onStop();
                }}
                className="w-full py-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-base transition active:scale-98 shadow-lg shadow-rose-600/20"
              >
                Finalizar y Guardar
              </button>
              <button
                onClick={() => setShowConfirmFinish(false)}
                className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-sm transition"
              >
                Seguir corriendo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Descartar Carrera */}
      {showConfirmCancel && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-neutral-950/95 backdrop-blur-md pointer-events-auto">
          <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 text-2xl font-bold">
              ⚠️
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">¿Descartar entrenamiento?</h3>
              <p className="text-sm text-neutral-400 mt-1">
                Se cancelará la sesión actual y no se guardará ningún dato en tu historial.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setShowConfirmCancel(false);
                  onCancel();
                }}
                className="w-full py-3.5 rounded-xl bg-neutral-800 hover:bg-rose-600 text-white font-bold text-base transition"
              >
                Descartar Carrera
              </button>
              <button
                onClick={() => setShowConfirmCancel(false)}
                className="w-full py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-semibold text-sm border border-neutral-700 transition"
              >
                Seguir corriendo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
