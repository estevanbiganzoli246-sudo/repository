import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { runService } from '../services/runService';
import { RunData } from '../types/run';
import { formatDistance, formatDuration, formatPace, formatDate } from '../utils/geo';
import { RunDetailModal } from './RunDetailModal';

interface RecentActivityViewProps {
  onStartRun: () => void;
  refreshKey?: number;
  onRunUpdated?: () => void;
}

export const RecentActivityView: React.FC<RecentActivityViewProps> = ({
  onStartRun,
  refreshKey = 0,
  onRunUpdated,
}) => {
  const { currentUser } = useAuth();
  const [runs, setRuns] = useState<RunData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunData | null>(null);

  const fetchUserRuns = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const userRuns = await runService.getUserRuns(currentUser.uid);
      setRuns(userRuns);
    } catch (err) {
      console.error('Error fetching user runs:', err);
      setError('No se pudieron cargar tus carreras. Comprueba tu conexión.');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchUserRuns();
  }, [fetchUserRuns, refreshKey]);

  const handleRunDeleted = () => {
    fetchUserRuns();
    if (onRunUpdated) onRunUpdated();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Actividad Reciente
          </h3>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
        {!loading && runs.length > 0 && (
          <span className="text-xs text-neutral-400 font-mono">
            {runs.length} {runs.length === 1 ? 'carrera' : 'carreras'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 animate-pulse flex items-center justify-between"
            >
              <div className="space-y-2.5 w-2/3">
                <div className="h-4 bg-neutral-800 rounded w-1/2" />
                <div className="h-3 bg-neutral-800/60 rounded w-1/3" />
                <div className="h-3 bg-neutral-800/40 rounded w-3/4" />
              </div>
              <div className="w-10 h-10 rounded-xl bg-neutral-800/60" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-red-950/20 border border-red-900/30 text-center space-y-2">
          <p className="text-xs text-red-400">{error}</p>
          <button
            onClick={fetchUserRuns}
            className="text-xs text-emerald-400 font-semibold hover:underline"
          >
            Reintentar
          </button>
        </div>
      ) : runs.length === 0 ? (
        /* Empty State */
        <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-3xl p-8 sm:p-10 text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl shadow-inner">
            🏃
          </div>
          <h4 className="text-base font-bold text-white tracking-tight">
            Todavía no tienes carreras
          </h4>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
            Sal a correr para comenzar a registrar tu actividad. Tus distancias, tiempos y mapas
            aparecerán aquí automáticamente con datos 100% reales.
          </p>
          <div className="pt-2">
            <button
              onClick={onStartRun}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-neutral-950 font-bold text-xs transition shadow-lg shadow-emerald-500/10 active:scale-95"
            >
              <span>Comenzar a correr</span>
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        /* Runs List */
        <div className="space-y-3">
          {runs.map((run) => (
            <div
              key={run.id}
              onClick={() => setSelectedRun(run)}
              className="p-4 sm:p-5 rounded-2xl bg-neutral-900/80 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer flex items-center justify-between group shadow-sm"
            >
              <div className="space-y-1.5 flex-1 pr-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white group-hover:text-emerald-400 transition">
                    {run.title}
                  </span>
                  {run.isPublic ? (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-emerald-400 border border-neutral-700/60 flex items-center gap-1">
                      <span>🌐</span> Pública
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700/60 flex items-center gap-1">
                      <span>🔒</span> Privada
                    </span>
                  )}
                  {run.photos && run.photos.length > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-amber-300 border border-neutral-700/60 flex items-center gap-1">
                      <span>📸</span> {run.photos.length}
                    </span>
                  )}
                </div>

                <div className="text-xs text-neutral-400">
                  {formatDate(run.startedAt)}
                </div>

                <div className="flex items-center gap-3 pt-1 text-xs font-mono">
                  <span className="text-emerald-400 font-black">
                    {formatDistance(run.distanceKm)}
                  </span>
                  <span className="text-neutral-600">•</span>
                  <span className="text-neutral-200">
                    {formatDuration(run.durationSeconds)}
                  </span>
                  <span className="text-neutral-600">•</span>
                  <span className="text-neutral-400">
                    {formatPace(run.avgPaceSecondsPerKm)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-neutral-500 group-hover:text-emerald-400 transition flex-shrink-0">
                <span className="text-xs font-semibold hidden sm:inline">Ver ruta</span>
                <div className="w-8 h-8 rounded-full bg-neutral-800/80 group-hover:bg-emerald-500/20 flex items-center justify-center transition">
                  <svg
                    className="w-4 h-4 transform group-hover:translate-x-0.5 transition"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedRun && (
        <RunDetailModal
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
          onDeleted={handleRunDeleted}
        />
      )}
    </div>
  );
};
