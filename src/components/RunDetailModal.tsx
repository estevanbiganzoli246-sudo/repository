import React, { useState } from 'react';
import { RunMap } from './RunMap';
import { RunData } from '../types/run';
import { formatDistance, formatDuration, formatPace, formatSpeed, formatDate } from '../utils/geo';
import { useAuth } from '../context/AuthContext';
import { runService } from '../services/runService';

interface RunDetailModalProps {
  run: RunData;
  onClose: () => void;
  onDeleted?: () => void;
  onOpenUserProfile?: (userId: string) => void;
}

export const RunDetailModal: React.FC<RunDetailModalProps> = ({ run, onClose, onDeleted, onOpenUserProfile }) => {
  const { currentUser } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);

  const isOwner = currentUser?.uid === run.userId;

  const handleDelete = async () => {
    if (!isOwner) return;
    setIsDeleting(true);
    try {
      await runService.deleteRun(run.id, run.userId);
      if (onDeleted) onDeleted();
      onClose();
    } catch (err) {
      console.error(err);
      setIsDeleting(false);
    }
  };

  const runVisibility = run.visibility || (run.isPublic ? 'public' : 'private');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/90 backdrop-blur-xl p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col my-8">
        {/* Header */}
        <div className="p-6 bg-neutral-900/90 border-b border-neutral-800 flex items-center justify-between">
          <div
            onClick={() => {
              if (onOpenUserProfile && run.userId) {
                onOpenUserProfile(run.userId);
                onClose();
              }
            }}
            className={`flex items-center gap-3 ${onOpenUserProfile ? 'cursor-pointer group' : ''}`}
          >
            {run.userPhotoURL ? (
              <img
                src={run.userPhotoURL}
                alt={run.userDisplayName}
                className="w-10 h-10 rounded-full border border-neutral-700 object-cover group-hover:border-emerald-500 transition"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center border border-emerald-500/30 group-hover:border-emerald-500 transition">
                {run.userDisplayName.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white leading-tight">{run.title}</h3>
                {runVisibility === 'public' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    🌎 Pública
                  </span>
                )}
                {runVisibility === 'followers' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    👥 Seguidores
                  </span>
                )}
                {runVisibility === 'private' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700/60">
                    🔒 Privada
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-400 flex items-center gap-2 mt-0.5">
                <span className="group-hover:text-emerald-400 transition font-medium">{run.userDisplayName}</span>
                <span>•</span>
                <span>{formatDate(run.startedAt)}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Map Preview */}
          <div className="h-64 w-full rounded-2xl overflow-hidden border border-neutral-800 relative">
            <RunMap routePoints={run.routePoints} isLive={false} className="h-full w-full" />
            <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-lg bg-neutral-950/80 backdrop-blur text-[11px] font-bold text-white border border-neutral-800">
              📍 Ruta Real ({run.routePoints.length} puntos GPS)
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800">
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">
                Distancia
              </div>
              <div className="text-2xl font-black font-mono text-white">
                {formatDistance(run.distanceKm)}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800">
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">
                Tiempo
              </div>
              <div className="text-2xl font-black font-mono text-white">
                {formatDuration(run.durationSeconds)}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800">
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">
                Ritmo Medio
              </div>
              <div className="text-2xl font-black font-mono text-emerald-400">
                {formatPace(run.avgPaceSecondsPerKm)}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-950/60 border border-neutral-800">
              <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-0.5">
                Velocidad Media
              </div>
              <div className="text-2xl font-black font-mono text-white">
                {formatSpeed(run.avgSpeedKmh)}
              </div>
            </div>
          </div>

          {/* Photos if any */}
          {run.photos && run.photos.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                Fotos de la Sesión
              </div>
              <div className="grid grid-cols-3 gap-2">
                {run.photos.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActivePhoto(p)}
                    className="rounded-xl overflow-hidden aspect-video border border-neutral-800 bg-neutral-950 focus:outline-none"
                  >
                    <img src={p} alt={`Foto ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes if any */}
          {run.notes && (
            <div className="p-4 rounded-2xl bg-neutral-950/40 border border-neutral-800 text-sm">
              <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                Notas del Corredor
              </div>
              <p className="text-neutral-200">{run.notes}</p>
            </div>
          )}

          {/* Splits list */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Divisiones por Kilómetro (Splits)
            </h4>
            {run.splits && run.splits.length > 0 ? (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {run.splits.map((s) => (
                  <div
                    key={s.km}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs font-mono"
                  >
                    <span className="font-sans text-neutral-300 font-semibold">Km {s.km}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-neutral-400">{formatDuration(s.splitTimeSeconds)}</span>
                      <span className="text-emerald-400 font-bold">{formatPace(s.avgPaceSeconds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-neutral-950/40 border border-neutral-800/80 text-xs text-neutral-500 text-center">
                Sin splits por kilómetro completo.
              </div>
            )}
          </div>

          {/* Owner actions */}
          {isOwner && (
            <div className="pt-2 border-t border-neutral-800 flex justify-end">
              {showConfirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-400">¿Eliminar carrera?</span>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition disabled:opacity-50"
                  >
                    {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
                  </button>
                  <button
                    onClick={() => setShowConfirmDelete(false)}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 text-xs transition"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmDelete(true)}
                  className="text-xs font-semibold text-red-400 hover:text-red-300 transition flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Eliminar esta carrera</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full Photo Viewer Modal */}
      {activePhoto && (
        <div
          onClick={() => setActivePhoto(null)}
          className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 cursor-pointer"
        >
          <img src={activePhoto} alt="Foto de carrera" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button
            onClick={() => setActivePhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-neutral-900/80 text-white flex items-center justify-center text-lg"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
