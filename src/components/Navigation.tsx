import React from 'react';

export type NavTab = 'home' | 'explore' | 'coach' | 'community' | 'profile';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onStartRun: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  onStartRun,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/90 border-t border-neutral-800/80 backdrop-blur-xl px-2 py-2 sm:px-6">
      <div className="max-w-md mx-auto flex items-center justify-between relative">
        {/* 🏠 Inicio */}
        <button
          onClick={() => onSelectTab('home')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            currentTab === 'home' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span className="text-[11px]">Inicio</span>
        </button>

        {/* 🗺️ Explorar */}
        <button
          onClick={() => onSelectTab('explore')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            currentTab === 'explore' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span className="text-[11px]">Explorar</span>
        </button>

        {/* 🟢 CORRER - Central Prominent Button */}
        <div className="flex-1 flex justify-center -mt-6">
          <button
            onClick={onStartRun}
            className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black flex flex-col items-center justify-center shadow-lg shadow-emerald-500/30 transition transform active:scale-95 border-4 border-neutral-950"
            title="Comenzar a Correr"
          >
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" />
            </svg>
          </button>
        </div>

        {/* 👥 Comunidad */}
        <button
          onClick={() => onSelectTab('community')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            currentTab === 'community' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-[11px]">Comunidad</span>
        </button>

        {/* 👤 Perfil */}
        <button
          onClick={() => onSelectTab('profile')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition ${
            currentTab === 'profile' ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[11px]">Perfil</span>
        </button>
      </div>
    </nav>
  );
};
