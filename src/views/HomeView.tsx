import React from 'react';
import { useAuth } from '../context/AuthContext';
import { formatDistance, formatDuration, formatPace } from '../utils/geo';
import { RecentActivityView } from '../components/RecentActivityView';

interface HomeViewProps {
  onStartRun: () => void;
  onExplore: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onStartRun, onExplore }) => {
  const { userProfile, refreshProfile } = useAuth();

  const totalKm = userProfile?.totalDistanceKm || 0;
  const totalRuns = userProfile?.totalRuns || 0;
  const totalDuration = userProfile?.totalDurationSec || 0;
  const bestPace = userProfile?.bestPaceSecPerKm;

  return (
    <div className="space-y-6 pb-24">
      {/* User Welcome Card */}
      <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {userProfile?.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={userProfile.displayName}
                className="w-12 h-12 rounded-full border-2 border-emerald-500/40 object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-lg border border-emerald-500/30">
                {userProfile?.displayName ? userProfile.displayName.substring(0, 2).toUpperCase() : 'RW'}
              </div>
            )}
            <div>
              <div className="text-xs text-neutral-400 font-medium">Bienvenido de nuevo,</div>
              <h2 className="text-xl font-black text-white">{userProfile?.displayName}</h2>
            </div>
          </div>

          <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            GPS Listo
          </div>
        </div>

        {/* Start Run Call To Action */}
        <button
          onClick={onStartRun}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-neutral-950 font-black text-lg transition duration-200 shadow-xl shadow-emerald-500/20 active:scale-98 flex items-center justify-center gap-3"
        >
          <span className="w-3 h-3 rounded-full bg-neutral-950 animate-ping" />
          <span>COMENZAR A CORRER</span>
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" />
          </svg>
        </button>
      </div>

      {/* Aggregate Real Metrics */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Estadísticas Reales Acumuladas
          </h3>
          <span className="text-[11px] text-emerald-400 font-semibold">100% Verídicas</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
              Kilómetros Totales
            </div>
            <div className="text-2xl font-black font-mono text-white">
              {formatDistance(totalKm)}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
              Carreras Totales
            </div>
            <div className="text-2xl font-black font-mono text-white">
              {totalRuns}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
              Tiempo Corrido
            </div>
            <div className="text-2xl font-black font-mono text-white">
              {formatDuration(totalDuration)}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
              Mejor Ritmo
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400">
              {bestPace ? formatPace(bestPace) : '--:-- /km'}
            </div>
          </div>
        </div>
      </div>

      {/* Rule Notification */}
      <div className="p-3.5 rounded-2xl bg-neutral-900/40 border border-neutral-800/80 text-xs text-neutral-400 flex items-center gap-2.5">
        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          En RunWorld nunca verás números simulados ni rutas predeterminadas. Tu progreso refleja únicamente tus entrenamientos reales.
        </span>
      </div>

      {/* Recent Activity View Component */}
      <RecentActivityView
        onStartRun={onStartRun}
        onRunUpdated={() => {
          refreshProfile();
        }}
      />

      {/* Footer credit */}
      <footer className="pt-6 pb-2 text-center text-xs text-neutral-500">
        <p>RunWorld © 2026 — Registro real y verídico</p>
        <p className="mt-1 text-neutral-400 font-medium">
          Diseñado por <span className="text-emerald-400 font-semibold">Estevan Biganzoli</span>
        </p>
      </footer>
    </div>
  );
};
