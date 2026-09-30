import React, { useState, useEffect, useCallback } from 'react';
import { runService } from '../services/runService';
import { RunData } from '../types/run';
import { formatDistance, formatDuration, formatPace, formatDate } from '../utils/geo';
import { RunDetailModal } from '../components/RunDetailModal';
import { useAuth } from '../context/AuthContext';

interface ExploreViewProps {
  onOpenUserProfile?: (userId: string) => void;
}

export const ExploreView: React.FC<ExploreViewProps> = ({ onOpenUserProfile }) => {
  const { currentUser } = useAuth();
  const [publicRuns, setPublicRuns] = useState<RunData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRun, setSelectedRun] = useState<RunData | null>(null);

  const fetchPublicRuns = useCallback(async () => {
    setLoading(true);
    try {
      const runs = await runService.getPublicRuns(currentUser?.uid);
      setPublicRuns(runs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]);

  useEffect(() => {
    fetchPublicRuns();
  }, [fetchPublicRuns]);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">Explorar Rutas Reales</h2>
        <p className="text-xs text-neutral-400 mt-1">
          Descubre rutas reales compartidas por corredores auténticos de la comunidad.
        </p>
      </div>

      {loading ? (
        <div className="p-16 text-center text-neutral-400 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Cargando rutas de la comunidad...</span>
        </div>
      ) : publicRuns.length === 0 ? (
        <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-3xl p-12 text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl">
            🗺️
          </div>
          <h4 className="text-base font-bold text-white">Aún no hay carreras públicas compartidas</h4>
          <p className="text-xs text-neutral-400 max-w-sm mx-auto">
            Sé el primero en compartir tu recorrido con la comunidad. Al finalizar una carrera activa la opción "Compartir en la comunidad".
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {publicRuns.map((run) => (
            <div
              key={run.id}
              onClick={() => setSelectedRun(run)}
              className="p-5 rounded-3xl bg-neutral-900/80 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer flex flex-col justify-between group shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div
                    onClick={(e) => {
                      if (onOpenUserProfile) {
                        e.stopPropagation();
                        onOpenUserProfile(run.userId);
                      }
                    }}
                    className="flex items-center gap-2.5 cursor-pointer group/author"
                  >
                    {run.userPhotoURL ? (
                      <img
                        src={run.userPhotoURL}
                        alt={run.userDisplayName}
                        className="w-8 h-8 rounded-full border border-neutral-700 object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                        {run.userDisplayName.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-semibold text-neutral-300 group-hover/author:text-emerald-400 transition">
                      {run.userDisplayName}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {(run.visibility === 'public' || (!run.visibility && run.isPublic)) && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        🌎 Pública
                      </span>
                    )}
                    {run.visibility === 'followers' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                        👥 Seguidores
                      </span>
                    )}
                    <span className="text-[11px] text-neutral-500">
                      {formatDate(run.startedAt)}
                    </span>
                  </div>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition mb-2">
                  {run.title}
                </h3>

                {run.notes && (
                  <p className="text-xs text-neutral-400 line-clamp-2 mb-3">
                    {run.notes}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-neutral-800 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 font-bold">
                    {formatDistance(run.distanceKm)}
                  </span>
                  <span className="text-neutral-500">•</span>
                  <span className="text-neutral-300">
                    {formatDuration(run.durationSeconds)}
                  </span>
                  <span className="text-neutral-500">•</span>
                  <span className="text-neutral-400">
                    {formatPace(run.avgPaceSecondsPerKm)}
                  </span>
                </div>

                <span className="text-[11px] font-sans text-emerald-400 font-semibold flex items-center gap-1">
                  Ver ruta →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedRun && (
        <RunDetailModal
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
          onDeleted={fetchPublicRuns}
          onOpenUserProfile={onOpenUserProfile}
        />
      )}
    </div>
  );
};
