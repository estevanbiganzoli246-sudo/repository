import React, { useState, useRef } from 'react';
import { RunMap } from './RunMap';
import { GpsPoint, KmSplit, RunData, VisibilityLevel } from '../types/run';
import { formatDistance, formatDuration, formatPace, formatSpeed } from '../utils/geo';
import { useAuth } from '../context/AuthContext';
import { runService } from '../services/runService';
import { compressImageFile } from '../utils/imageUtils';

interface RunSummaryModalProps {
  distanceKm: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  routePoints: GpsPoint[];
  splits: KmSplit[];
  onSaved: () => void;
  onDiscard: () => void;
}

export const RunSummaryModal: React.FC<RunSummaryModalProps> = ({
  distanceKm,
  durationSeconds,
  avgPaceSecondsPerKm,
  avgSpeedKmh,
  maxSpeedKmh,
  routePoints,
  splits,
  onSaved,
  onDiscard,
}) => {
  const { currentUser, userProfile, refreshProfile } = useAuth();
  const [title, setTitle] = useState<string>(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Carrera Matutina';
    if (hour < 19) return 'Carrera de la Tarde';
    return 'Carrera Nocturna';
  });
  const [notes, setNotes] = useState<string>('');
  const [visibility, setVisibility] = useState<VisibilityLevel>(() => {
    return userProfile?.privacySettings?.defaultPublicRuns === false ? 'private' : 'public';
  });
  const [protectLocation, setProtectLocation] = useState<boolean>(
    userProfile?.privacySettings?.protectLocation ?? false
  );
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute altitude if available
  const altitudes = routePoints
    .map((p) => p.altitude)
    .filter((a): a is number => a !== null && typeof a === 'number');

  const minAlt = altitudes.length > 0 ? Math.min(...altitudes) : null;
  const maxAlt = altitudes.length > 0 ? Math.max(...altitudes) : null;
  const elevationGain = minAlt !== null && maxAlt !== null ? Math.round(maxAlt - minAlt) : null;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      try {
        const compressedBase64 = await compressImageFile(files[i]);
        setPhotos((prev) => [...prev, compressedBase64]);
      } catch (err) {
        console.error('Error compressing photo:', err);
      }
    }
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    setSaveError(null);

    const nowIso = new Date().toISOString();
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newRun: RunData = {
      id: runId,
      userId: currentUser.uid,
      userDisplayName: userProfile?.displayName || currentUser.displayName || 'Corredor',
      userPhotoURL: userProfile?.photoURL || currentUser.photoURL || null,
      title: title.trim() || 'Carrera de Entrenamiento',
      notes: notes.trim(),
      distanceKm: Number(distanceKm.toFixed(2)),
      durationSeconds: Math.max(1, durationSeconds),
      avgPaceSecondsPerKm: Math.round(avgPaceSecondsPerKm),
      avgSpeedKmh: Number(avgSpeedKmh.toFixed(1)),
      maxSpeedKmh: Number(maxSpeedKmh.toFixed(1)),
      routePoints: routePoints,
      splits: splits,
      photos: photos,
      protectLocation: protectLocation,
      startedAt: new Date(Date.now() - durationSeconds * 1000).toISOString(),
      endedAt: nowIso,
      visibility: visibility,
      isPublic: visibility === 'public',
      createdAt: nowIso,
    };

    try {
      await runService.saveRun(newRun, userProfile);
      await refreshProfile();
      onSaved();
    } catch (err: unknown) {
      console.error('Error saving run:', err);
      setSaveError('No se pudo guardar la carrera en la base de datos. Inténtalo de nuevo.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/90 backdrop-blur-xl p-3 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] my-auto overflow-hidden">
        {/* Celebration Header */}
        <div className="flex-shrink-0 p-5 sm:p-6 bg-gradient-to-r from-emerald-950/60 to-teal-950/40 border-b border-neutral-800/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl">
                🏃
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Resumen de Carrera
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">Tu recorrido</h2>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-mono text-neutral-400">
                {routePoints.length} puntos GPS
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Main Triple Highlight: Distancia, Tiempo, Ritmo */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800 shadow-inner">
            <div className="text-center">
              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                Distancia
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white">
                {formatDistance(distanceKm)}
              </div>
            </div>

            <div className="text-center border-x border-neutral-800">
              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                Tiempo
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white">
                {formatDuration(durationSeconds)}
              </div>
            </div>

            <div className="text-center">
              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                Ritmo
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                {formatPace(avgPaceSecondsPerKm)}
              </div>
            </div>
          </div>

          {/* Interactive Map (OpenStreetMap) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-3 text-xs font-semibold text-neutral-300">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Inicio
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" />
                  Recorrido completo
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                  Final
                </span>
              </div>
              <span className="text-[11px] text-neutral-500 hidden sm:inline">
                Usa zoom para inspeccionar calles
              </span>
            </div>

            <div className="h-64 sm:h-72 w-full rounded-2xl overflow-hidden border border-neutral-800 relative shadow-inner">
              <RunMap routePoints={routePoints} isLive={false} className="h-full w-full" />
            </div>
          </div>

          {/* Secondary Stats: Max Speed & Elevation */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-neutral-950/40 border border-neutral-800 text-xs">
            <div>
              <span className="text-neutral-400">Velocidad Máxima: </span>
              <span className="font-bold text-white font-mono">{formatSpeed(maxSpeedKmh)}</span>
            </div>
            <div>
              <span className="text-neutral-400">Desnivel Aprox.: </span>
              <span className="font-bold text-white font-mono">
                {elevationGain !== null ? `+${elevationGain} m` : 'No disponible'}
              </span>
            </div>
          </div>

          {/* Km Splits Section */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Datos por Kilómetro (Splits Reales)
            </h4>

            {splits.length === 0 ? (
              <div className="p-4 rounded-xl bg-neutral-950/40 border border-neutral-800/80 text-xs text-neutral-400 text-center">
                {distanceKm < 1 ? (
                  <>Distancia registrada menor a 1 km. No hay splits completos disponibles.</>
                ) : (
                  <>No se registraron divisiones completas por kilómetro.</>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {splits.map((s) => (
                  <div
                    key={s.km}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                        {s.km}
                      </span>
                      <span className="text-neutral-300 font-sans font-medium">Kilómetro {s.km}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-neutral-400">{formatDuration(s.splitTimeSeconds)}</span>
                      <span className="text-emerald-400 font-bold">{formatPace(s.avgPaceSeconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Run Photos Section */}
          <div className="space-y-3 pt-2 border-t border-neutral-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Fotos de la Carrera (Opcional)
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1.5"
              >
                <span>📸 Añadir foto</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative group rounded-xl overflow-hidden aspect-video border border-neutral-800 bg-neutral-950">
                    <img src={photo} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-neutral-950/80 text-neutral-300 hover:text-white flex items-center justify-center text-xs opacity-80 hover:opacity-100"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Run Details Form */}
          <div className="space-y-4 pt-2 border-t border-neutral-800">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                Título de la Carrera
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={60}
                className="w-full px-4 py-3 rounded-xl bg-neutral-950 border border-neutral-800 text-white font-medium focus:outline-none focus:border-emerald-500 transition text-sm"
                placeholder="Ej. Carrera Matutina por el Parque"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                Notas y Sensaciones (Opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={300}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white font-medium focus:outline-none focus:border-emerald-500 transition text-sm resize-none"
                placeholder="¿Cómo te sentiste hoy? Clima, sensaciones, ritmo..."
              />
            </div>

            {/* Privacy: Public vs Followers vs Private */}
            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800 space-y-2.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
                🔒 Visibilidad de la Carrera
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility('public')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    visibility === 'public'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-sm'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  <span className="text-base">🌎</span>
                  <span>Pública</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('followers')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    visibility === 'followers'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-sm'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  <span className="text-base">👥</span>
                  <span>Seguidores</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility('private')}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    visibility === 'private'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-sm'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  <span className="text-base">🔒</span>
                  <span>Privada</span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 pt-0.5">
                {visibility === 'public' && '🌎 Visible para todos los usuarios en Explorar y en tu perfil.'}
                {visibility === 'followers' && '👥 Visible únicamente para los corredores que te siguen.'}
                {visibility === 'private' && '🔒 Solo tú podrás ver este entrenamiento en tu perfil.'}
              </p>
            </div>

            {/* Privacy: Location Protection */}
            {visibility !== 'private' && (
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-neutral-950/40 border border-neutral-800 text-xs">
                <div>
                  <div className="font-semibold text-neutral-300">Proteger zona de inicio/fin</div>
                  <div className="text-[11px] text-neutral-500">
                    Oculta los puntos exactos cercanos a tu hogar
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={protectLocation}
                  onChange={(e) => setProtectLocation(e.target.checked)}
                  className="rounded border-neutral-700 text-emerald-500 focus:ring-emerald-500 bg-neutral-900 w-4 h-4 cursor-pointer"
                />
              </div>
            )}
          </div>

          {saveError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {saveError}
            </div>
          )}
        </div>

        {/* Fixed Footer with Action Buttons */}
        <div className="flex-shrink-0 p-4 sm:p-5 bg-neutral-900/95 border-t border-neutral-800 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-sm sm:text-base transition shadow-xl shadow-emerald-500/20 active:scale-98 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                <span>Guardando carrera real...</span>
              </div>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                <span>Guardar Carrera</span>
              </>
            )}
          </button>

          <button
            onClick={onDiscard}
            disabled={isSaving}
            className="w-full sm:w-auto py-3.5 px-5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-sm transition"
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
};
