import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Navigation, NavTab } from './components/Navigation';
import { HomeView } from './views/HomeView';
import { ExploreView } from './views/ExploreView';
import { CommunityView } from './views/CommunityView';
import { ProfileView } from './views/ProfileView';
import { AICoachView } from './views/AICoachView';
import { ActiveRunView } from './components/ActiveRunView';
import { RunSummaryModal } from './components/RunSummaryModal';
import { NotificationsModal } from './components/NotificationsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { useGpsTracker } from './hooks/useGpsTracker';
import { communityService } from './services/communityService';
import { runService } from './services/runService';

const MainApp: React.FC = () => {
  const { currentUser, userProfile, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>('home');
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // GPS Tracking Engine with auto-persistence and recovery
  const tracker = useGpsTracker();

  // Online / Offline and background synchronization listener
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const synced = await runService.syncOfflineRuns(userProfile);
      if (synced > 0) {
        setSyncToast(`¡Conexión recuperada! Se sincronizó tu actividad pendiente.`);
        setTimeout(() => setSyncToast(null), 5000);
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [userProfile]);

  // Real-time unread notifications subscription with onSnapshot
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = communityService.subscribeToUserNotifications(currentUser.uid, (notifs) => {
      const unread = notifs.filter((n) => !n.read).length;
      setUnreadNotifsCount(unread);
    });
    return () => unsubscribe();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4">
        <div className="relative flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
            <svg className="w-8 h-8 text-neutral-950 font-black" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="absolute -inset-2 rounded-3xl border border-emerald-500/20 animate-ping" />
        </div>
        <div className="text-xl font-black tracking-tight text-white flex items-center gap-2">
          RUNWORLD
        </div>
        <div className="text-xs text-neutral-400 mt-2 font-mono">
          Cargando entorno deportivo verídico...
        </div>
      </div>
    );
  }

  // Not logged in: Show multi-platform sign in screen
  if (!currentUser) {
    return <LoginScreen />;
  }

  const isTrackingActive = tracker.status !== 'idle' && tracker.status !== 'completed';

  const handleStartRun = () => {
    tracker.startRunning();
  };

  const handleRunCompleted = () => {
    tracker.stopRunning();
    setShowSummary(true);
  };

  const handleDiscardRun = () => {
    tracker.resetTracker();
    setShowSummary(false);
  };

  const handleRunSaved = () => {
    tracker.resetTracker();
    setShowSummary(false);
    setCurrentTab('home');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="bg-amber-500/20 border-b border-amber-500/40 text-amber-300 px-4 py-2 text-xs text-center sticky top-0 z-50 flex items-center justify-center gap-2 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Modo sin conexión activo: Tus carreras y puntos GPS se guardan localmente y se sincronizarán al recuperar señal.</span>
        </div>
      )}

      {/* Sync toast notification */}
      {syncToast && (
        <div className="bg-emerald-500 text-neutral-950 font-bold px-4 py-2.5 text-xs text-center sticky top-0 z-50 shadow-lg animate-fade-in flex items-center justify-center gap-2">
          <span>🔄</span>
          <span>{syncToast}</span>
        </div>
      )}

      {/* Top Application Bar */}
      <header className="sticky top-0 z-30 bg-neutral-950/90 border-b border-neutral-800/80 backdrop-blur-xl px-4 py-3 sm:px-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-md shadow-emerald-500/20">
              <svg className="w-4 h-4 text-neutral-950 font-black" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-black tracking-tight text-lg text-white">
              RUNWORLD
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* AI Coach Button */}
            <button
              onClick={() => {
                setViewingUserId(null);
                setCurrentTab('coach');
              }}
              className={`px-3 py-1.5 rounded-full border text-xs font-bold transition flex items-center gap-1.5 ${
                currentTab === 'coach'
                  ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                  : 'bg-neutral-900 text-neutral-200 border-neutral-800 hover:border-emerald-500/50'
              }`}
              title="Entrenador IA"
            >
              <span>🤖</span>
              <span className="hidden sm:inline">Coach IA</span>
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton />

            {/* Notifications Bell */}
            <button
              onClick={() => {
                setShowNotifications(true);
                setUnreadNotifsCount(0);
              }}
              className="relative p-2 rounded-full bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white transition"
              title="Notificaciones"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center shadow-sm">
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            {/* Profile Avatar Button */}
            <button
              onClick={() => {
                setViewingUserId(null);
                setCurrentTab('profile');
              }}
              className="flex items-center gap-2 p-1 pl-2.5 rounded-full bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition"
            >
              <span className="text-xs font-semibold text-neutral-300 max-w-[120px] truncate hidden sm:inline">
                {userProfile?.displayName?.split(' ')[0] || 'Mi Perfil'}
              </span>
              {userProfile?.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={userProfile.displayName}
                  className="w-7 h-7 rounded-full object-cover border border-neutral-700"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                  {userProfile?.displayName ? userProfile.displayName.substring(0, 1).toUpperCase() : 'R'}
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6">
        {/* Recovered Run Banner */}
        {tracker.recoveredRun && !isTrackingActive && (
          <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 to-neutral-900 border border-emerald-500/50 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg font-bold flex-shrink-0">
                💾
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Carrera recuperada de memoria local</h4>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Se conservaron {tracker.recoveredRun.distanceKm.toFixed(2)} km y {Math.floor(tracker.recoveredRun.durationSeconds / 60)} min antes del cierre.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={tracker.resumeRecoveredRun}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs shadow-md transition"
              >
                Reanudar
              </button>
              <button
                onClick={tracker.discardRecoveredRun}
                className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* When viewing a specific runner's profile */}
        {viewingUserId ? (
          <ProfileView
            userId={viewingUserId}
            onBack={() => setViewingUserId(null)}
            onOpenUserProfile={(uId) => setViewingUserId(uId)}
          />
        ) : (
          <>
            {currentTab === 'home' && (
              <HomeView
                onStartRun={handleStartRun}
                onExplore={() => setCurrentTab('explore')}
              />
            )}
            {currentTab === 'explore' && (
              <ExploreView onOpenUserProfile={(uId) => setViewingUserId(uId)} />
            )}
            {currentTab === 'coach' && (
              <AICoachView />
            )}
            {currentTab === 'community' && (
              <CommunityView onOpenUserProfile={(uId) => setViewingUserId(uId)} />
            )}
            {currentTab === 'profile' && (
              <ProfileView onOpenUserProfile={(uId) => setViewingUserId(uId)} />
            )}
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setViewingUserId(null);
          setCurrentTab(tab);
        }}
        onStartRun={handleStartRun}
      />

      {/* Active Run Full-screen Experience */}
      {isTrackingActive && (
        <ActiveRunView
          status={tracker.status}
          currentPoint={tracker.currentPoint}
          routePoints={tracker.routePoints}
          distanceKm={tracker.distanceKm}
          durationSeconds={tracker.durationSeconds}
          currentSpeedKmh={tracker.currentSpeedKmh}
          avgPaceSecondsPerKm={tracker.avgPaceSecondsPerKm}
          gpsError={tracker.gpsError}
          qualityLevel={tracker.qualityLevel}
          isCalibrating={tracker.isCalibrating}
          onCalibrateGps={tracker.calibrateGps}
          onPause={tracker.pauseRunning}
          onResume={tracker.resumeRunning}
          onStop={handleRunCompleted}
          onCancel={handleDiscardRun}
        />
      )}

      {/* Run Completion Summary Modal */}
      {showSummary && (
        <RunSummaryModal
          distanceKm={tracker.distanceKm}
          durationSeconds={tracker.durationSeconds}
          avgPaceSecondsPerKm={tracker.avgPaceSecondsPerKm}
          avgSpeedKmh={tracker.avgSpeedKmh}
          maxSpeedKmh={tracker.maxSpeedKmh}
          routePoints={tracker.routePoints}
          splits={tracker.splits}
          onSaved={handleRunSaved}
          onDiscard={handleDiscardRun}
        />
      )}

      {/* Notifications Modal */}
      {showNotifications && currentUser && (
        <NotificationsModal
          userId={currentUser.uid}
          onClose={() => setShowNotifications(false)}
          onOpenUserProfile={(uId) => setViewingUserId(uId)}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
