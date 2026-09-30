import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const LoginScreen: React.FC = () => {
  const { loginWithGoogle, loginWithApple, loginWithEmail, signupWithEmail } = useAuth();
  const [authMode, setAuthMode] = useState<'providers' | 'email_login' | 'email_signup'>('providers');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGoogle = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Error al conectar con Google. Inténtalo de nuevo.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApple = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await loginWithApple();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setErrorMsg('Error al conectar con Apple ID. Inténtalo de nuevo.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor completa todos los campos.');
      return;
    }
    if (authMode === 'email_signup' && !displayName) {
      setErrorMsg('Por favor ingresa tu nombre de corredor.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      if (authMode === 'email_signup') {
        await signupWithEmail(email, password, displayName);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err: any) {
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/user-not-found' || err?.code === 'auth/wrong-password') {
        setErrorMsg('Credenciales inválidas. Comprueba tu correo y contraseña.');
      } else if (err?.code === 'auth/email-already-in-use') {
        setErrorMsg('Este correo ya está registrado. Inicia sesión en su lugar.');
      } else if (err?.code === 'auth/weak-password') {
        setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      } else {
        setErrorMsg('Error de autenticación. Inténtalo de nuevo.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-between p-6 sm:p-10 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header / Brand */}
      <div className="max-w-md mx-auto w-full pt-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg className="w-6 h-6 text-neutral-950 font-black" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
              RUNWORLD
              <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                GPS REAL
              </span>
            </h1>
          </div>
        </div>
      </div>

      {/* Main Hero Card */}
      <div className="max-w-md mx-auto w-full my-auto py-8 z-10">
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-3xl p-7 sm:p-8 backdrop-blur-xl shadow-2xl">
          <div className="space-y-3 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Perfil Único Multiplataforma
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
              Entra desde cualquier dispositivo. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                Misma cuenta, tus datos reales.
              </span>
            </h2>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Tus carreras, seguidores y estadísticas siempre sincronizados en Android, iOS o PC.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {authMode === 'providers' ? (
            <div className="space-y-3">
              {/* Google Button */}
              <button
                onClick={handleGoogle}
                disabled={isProcessing}
                className="w-full py-3.5 px-5 rounded-2xl bg-white text-neutral-950 hover:bg-neutral-100 font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 shadow-lg shadow-white/5 active:scale-[0.98] disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                </svg>
                <span>Continuar con Google</span>
              </button>

              {/* Apple Button */}
              <button
                onClick={handleApple}
                disabled={isProcessing}
                className="w-full py-3.5 px-5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-sm transition-all duration-200 flex items-center justify-center gap-3 border border-neutral-700/80 active:scale-[0.98] disabled:opacity-50"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.89c.66-.82 1.11-1.96.99-3.1-.96.04-2.12.64-2.8 1.44-.61.71-1.14 1.87-1 2.98 1.07.08 2.16-.54 2.81-1.32z" />
                </svg>
                <span>Sign in with Apple</span>
              </button>

              <div className="relative py-2 flex items-center justify-center">
                <div className="border-t border-neutral-800 w-full" />
                <span className="bg-neutral-900 px-3 text-[11px] uppercase font-bold text-neutral-500 absolute">
                  o con correo
                </span>
              </div>

              {/* Email / Password Options */}
              <button
                type="button"
                onClick={() => setAuthMode('email_login')}
                className="w-full py-3.5 px-5 rounded-2xl bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 text-neutral-300 font-semibold text-sm transition flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>Acceder con Email y Contraseña</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="space-y-3.5">
              {authMode === 'email_signup' && (
                <div>
                  <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                    Nombre o Apodo
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    placeholder="Tu nombre de corredor"
                    className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="ejemplo@correo.com"
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <div className="w-5 h-5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                ) : authMode === 'email_signup' ? (
                  'Crear mi Cuenta de Corredor'
                ) : (
                  'Iniciar Sesión'
                )}
              </button>

              <div className="flex items-center justify-between pt-1 text-xs">
                {authMode === 'email_login' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setAuthMode('email_signup')}
                      className="text-emerald-400 hover:underline"
                    >
                      ¿No tienes cuenta? Regístrate
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('providers')}
                      className="text-neutral-400 hover:text-white"
                    >
                      Volver
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setAuthMode('email_login')}
                      className="text-emerald-400 hover:underline"
                    >
                      ¿Ya tienes cuenta? Inicia sesión
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('providers')}
                      className="text-neutral-400 hover:text-white"
                    >
                      Volver
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Footer with mandatory attribution */}
      <div className="max-w-md mx-auto w-full text-center z-10 space-y-1 text-xs text-neutral-500">
        <p>RunWorld © 2026 — Registro real de carreras deportivas</p>
        <p className="text-neutral-400 font-medium">
          Diseñado por <span className="text-emerald-400 font-semibold tracking-wide">Estevan Biganzoli</span>
        </p>
      </div>
    </div>
  );
};
