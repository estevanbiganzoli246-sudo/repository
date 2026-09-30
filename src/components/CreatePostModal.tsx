import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { runService } from '../services/runService';
import { communityService } from '../services/communityService';
import { RunData, AttachedRunSummary, VisibilityLevel } from '../types/run';
import { compressImageFile } from '../utils/imageUtils';
import { formatDistance, formatDuration, formatPace } from '../utils/geo';

interface CreatePostModalProps {
  initialRun?: RunData | null;
  onClose: () => void;
  onPostCreated: () => void;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  initialRun,
  onClose,
  onPostCreated,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<VisibilityLevel>('public');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [attachedRun, setAttachedRun] = useState<AttachedRunSummary | null>(() => {
    if (initialRun) {
      return {
        runId: initialRun.id,
        title: initialRun.title,
        distanceKm: initialRun.distanceKm,
        durationSeconds: initialRun.durationSeconds,
        avgPaceSecondsPerKm: initialRun.avgPaceSecondsPerKm,
      };
    }
    return null;
  });
  const [userRuns, setUserRuns] = useState<RunData[]>([]);
  const [showRunPicker, setShowRunPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    runService.getUserRuns(currentUser.uid).then(setUserRuns).catch(console.error);
  }, [currentUser]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressImageFile(file);
      setPhotoDataUrl(base64);
    } catch (err) {
      console.error(err);
      setErrorMsg('No se pudo procesar la imagen.');
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!text.trim() && !photoDataUrl && !attachedRun) {
      setErrorMsg('Escribe un texto, sube una foto o asocia una carrera.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await communityService.createPost({
        userId: currentUser.uid,
        authorName: userProfile?.displayName || currentUser.displayName || 'Corredor',
        authorUsername: userProfile?.username || '@corredor',
        authorPhotoURL: userProfile?.photoURL || currentUser.photoURL || null,
        text: text.trim(),
        photoURL: photoDataUrl || null,
        location: location.trim() || null,
        runActivity: attachedRun || null,
        visibility,
      });

      onPostCreated();
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al publicar. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/85 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col my-8">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">➕</span>
            <h3 className="font-bold text-white text-base">Crear Publicación</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handlePublish} className="p-5 space-y-4">
          {/* User Header */}
          <div className="flex items-center gap-3">
            {userProfile?.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt={userProfile.displayName}
                className="w-10 h-10 rounded-full object-cover border border-neutral-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-sm">
                {userProfile?.displayName?.substring(0, 2).toUpperCase() || 'RW'}
              </div>
            )}
            <div>
              <div className="text-sm font-bold text-white">{userProfile?.displayName}</div>
              <div className="text-xs text-neutral-400">{userProfile?.username || '@corredor'}</div>
            </div>
          </div>

          {/* Text Area */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="¿Qué tal estuvo tu entrenamiento hoy? Comparte tus sensaciones..."
            className="w-full p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800 text-white text-sm focus:outline-none focus:border-emerald-500 resize-none leading-relaxed"
          />

          {/* Location Input */}
          <div className="flex items-center gap-2 p-2 px-3 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs">
            <span className="text-sm">📍</span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Añadir ubicación (ej. Montevideo, Parque Batlle)"
              maxLength={60}
              className="bg-transparent flex-1 text-neutral-200 focus:outline-none"
            />
          </div>

          {/* Attached Photo Preview */}
          {photoDataUrl && (
            <div className="relative rounded-2xl overflow-hidden border border-neutral-800 aspect-video bg-neutral-950">
              <img src={photoDataUrl} alt="Foto de publicación" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotoDataUrl(null)}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-neutral-900/90 text-white flex items-center justify-center text-xs hover:bg-rose-600 transition"
              >
                ✕
              </button>
            </div>
          )}

          {/* Attached Run Activity Card */}
          {attachedRun && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/40 to-neutral-900 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
                  🏃
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{attachedRun.title}</div>
                  <div className="text-xs font-mono text-emerald-400 mt-0.5">
                    {formatDistance(attachedRun.distanceKm)} · {formatDuration(attachedRun.durationSeconds)} · {formatPace(attachedRun.avgPaceSecondsPerKm)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedRun(null)}
                className="text-neutral-400 hover:text-white text-xs p-1"
                title="Quitar carrera"
              >
                ✕
              </button>
            </div>
          )}

          {/* Action Row: Camera, Gallery, Attach Run */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              {/* Camera Button */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white flex items-center gap-1.5 transition"
              >
                <span>📷</span>
                <span>Cámara</span>
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoSelect}
              />

              {/* Gallery Button */}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-xs font-semibold text-neutral-300 hover:text-white flex items-center gap-1.5 transition"
              >
                <span>🖼️</span>
                <span>Galería</span>
              </button>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />

              {/* Associate Run Button */}
              {userRuns.length > 0 && !attachedRun && (
                <button
                  type="button"
                  onClick={() => setShowRunPicker(!showRunPicker)}
                  className="px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition"
                >
                  <span>🏃</span>
                  <span>Vincular Carrera</span>
                </button>
              )}
            </div>
          </div>

          {/* Run Picker Selector Modal */}
          {showRunPicker && (
            <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                Elige una de tus carreras reales:
              </div>
              {userRuns.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setAttachedRun({
                      runId: r.id,
                      title: r.title,
                      distanceKm: r.distanceKm,
                      durationSeconds: r.durationSeconds,
                      avgPaceSecondsPerKm: r.avgPaceSecondsPerKm,
                    });
                    setShowRunPicker(false);
                  }}
                  className="p-2.5 rounded-xl bg-neutral-900/80 hover:bg-emerald-950/30 border border-neutral-800 hover:border-emerald-500/40 cursor-pointer flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-white">{r.title}</span>
                  <span className="font-mono text-emerald-400">{formatDistance(r.distanceKm)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Visibility Selector */}
          <div className="space-y-1.5 pt-1 border-t border-neutral-800/80">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-400">
              🔒 Visibilidad de la Publicación
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
              {visibility === 'public' && '🌎 Visible para todos los usuarios de la comunidad RunWorld.'}
              {visibility === 'followers' && '👥 Visible únicamente para los corredores que te siguen.'}
              {visibility === 'private' && '🔒 Visible solo para ti en tu propio perfil.'}
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-sm transition shadow-lg shadow-emerald-500/20 active:scale-98 disabled:opacity-50"
            >
              {submitting ? 'Publicando...' : 'Publicar en la Comunidad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
