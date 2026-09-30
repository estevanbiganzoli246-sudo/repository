import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { formatDistance, formatDuration, formatPace, formatDate } from '../utils/geo';
import { compressImageFile } from '../utils/imageUtils';
import { runService } from '../services/runService';
import { communityService } from '../services/communityService';
import { RunData, UserProfile, CommunityPost } from '../types/run';
import { RunDetailModal } from '../components/RunDetailModal';
import { PostDetailModal } from '../components/PostDetailModal';
import { FollowListModal } from '../components/FollowListModal';
import { CreatePostModal } from '../components/CreatePostModal';

interface ProfileViewProps {
  userId?: string;
  onBack?: () => void;
  onOpenUserProfile?: (targetUserId: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userId: propUserId,
  onBack,
  onOpenUserProfile,
}) => {
  const { currentUser, userProfile: myProfile, logout, updateProfileDetails } = useAuth();

  const targetUserId = propUserId || currentUser?.uid || '';
  const isOwnProfile = !!currentUser && targetUserId === currentUser.uid;

  // Profile data
  const [profile, setProfile] = useState<UserProfile | null>(isOwnProfile ? myProfile : null);
  const [loadingProfile, setLoadingProfile] = useState<boolean>(!isOwnProfile);

  // Social relations & counts
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [postsCount, setPostsCount] = useState<number>(0);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followListModal, setFollowListModal] = useState<'followers' | 'following' | null>(null);

  // Edit Profile Form State (Own profile)
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [bio, setBio] = useState('');
  const [isProfilePublic, setIsProfilePublic] = useState(true);
  const [defaultPublicRuns, setDefaultPublicRuns] = useState(true);
  const [protectLocation, setProtectLocation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Tabs: default to 'posts' so user immediately sees their publications
  const [activeTab, setActiveTab] = useState<'posts' | 'runs' | 'stats' | 'photos'>('posts');

  // Posts State
  const [userPosts, setUserPosts] = useState<CommunityPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);

  // Runs State
  const [userRuns, setUserRuns] = useState<RunData[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedRun, setSelectedRun] = useState<RunData | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Load profile data and real social counts
  const loadProfileData = useCallback(async () => {
    if (!targetUserId) return;

    if (isOwnProfile && myProfile) {
      setProfile(myProfile);
      setDisplayName(myProfile.displayName || '');
      setUsername(myProfile.username || '');
      setCity(myProfile.city || '');
      setCountry(myProfile.country || '');
      setBio(myProfile.bio || '');
      setIsProfilePublic(myProfile.privacySettings?.isProfilePublic ?? true);
      setDefaultPublicRuns(myProfile.privacySettings?.defaultPublicRuns ?? true);
      setProtectLocation(myProfile.privacySettings?.protectLocation ?? false);
    } else {
      setLoadingProfile(true);
      try {
        const u = await communityService.getUserProfileById(targetUserId);
        setProfile(u);
      } catch (err) {
        console.error('Error loading target user profile:', err);
      } finally {
        setLoadingProfile(false);
      }
    }

    // Load REAL followers, following, and posts counts directly from Firestore relations
    try {
      const stats = await communityService.getUserSocialStats(targetUserId);
      setFollowersCount(stats.followersCount);
      setFollowingCount(stats.followingCount);
      setPostsCount(stats.postsCount);
    } catch (err) {
      console.error('Error loading social stats:', err);
    }

    // Check if current user is following this profile
    if (!isOwnProfile && currentUser) {
      try {
        const following = await communityService.isFollowing(currentUser.uid, targetUserId);
        setIsFollowing(following);
      } catch (err) {
        console.error('Error checking follow status:', err);
      }
    }
  }, [targetUserId, isOwnProfile, myProfile, currentUser]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  // Load User Posts
  const fetchPosts = useCallback(async () => {
    if (!targetUserId) return;
    setLoadingPosts(true);
    try {
      const posts = await communityService.getUserPosts(targetUserId, currentUser?.uid);
      setUserPosts(posts);
      setPostsCount(posts.length);
    } catch (err) {
      console.error('Error fetching user posts:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [targetUserId, currentUser?.uid]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Load User Runs
  const fetchRuns = useCallback(async () => {
    if (!targetUserId) return;
    setLoadingRuns(true);
    try {
      const runs = await runService.getUserRuns(targetUserId, currentUser?.uid);
      setUserRuns(runs);
    } catch (err) {
      console.error('Error fetching runs:', err);
    } finally {
      setLoadingRuns(false);
    }
  }, [targetUserId, currentUser?.uid]);

  useEffect(() => {
    if (activeTab === 'runs') {
      fetchRuns();
    }
  }, [activeTab, fetchRuns]);

  // Follow / Unfollow Toggle with real-time local counter updates and Firestore synchronization
  const handleToggleFollow = async () => {
    if (!currentUser || isOwnProfile || !profile) return;
    const nextFollowingState = !isFollowing;

    // Optimistic UI updates
    setIsFollowing(nextFollowingState);
    setFollowersCount((prev) => (nextFollowingState ? prev + 1 : Math.max(0, prev - 1)));

    try {
      if (nextFollowingState) {
        await communityService.followUser(
          currentUser.uid,
          targetUserId,
          myProfile?.displayName || currentUser.displayName || 'Corredor',
          myProfile?.photoURL || currentUser.photoURL || null,
          myProfile?.username
        );
      } else {
        await communityService.unfollowUser(currentUser.uid, targetUserId);
      }
      // Re-fetch posts and runs immediately after follow/unfollow so follower-scoped activities and posts update
      fetchPosts();
      fetchRuns();
    } catch (err) {
      console.error('Follow toggle error:', err);
      // Revert if error
      setIsFollowing(!nextFollowingState);
      setFollowersCount((prev) => (nextFollowingState ? Math.max(0, prev - 1) : prev + 1));
    }
  };

  // Avatar upload (Own profile)
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const compressed = await compressImageFile(file, 400, 400, 0.8);
      await updateProfileDetails({ photoURL: compressed });
      setProfile((prev) => (prev ? { ...prev, photoURL: compressed } : null));
    } catch (err) {
      console.error('Error uploading avatar:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Gallery upload (Own profile)
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    try {
      const newPhotos: string[] = [...(profile?.photos || [])];
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImageFile(files[i], 800, 800, 0.75);
        newPhotos.unshift(compressed);
      }
      await updateProfileDetails({ photos: newPhotos });
      setProfile((prev) => (prev ? { ...prev, photos: newPhotos } : null));
    } catch (err) {
      console.error('Error adding photos to gallery:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const removeGalleryPhoto = async (index: number) => {
    const updated = (profile?.photos || []).filter((_, i) => i !== index);
    await updateProfileDetails({ photos: updated });
    setProfile((prev) => (prev ? { ...prev, photos: updated } : null));
  };

  // Save profile changes (Own profile)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const payload: Partial<UserProfile> = {
        displayName: displayName.trim() || 'Corredor RunWorld',
        username: username.startsWith('@') ? username : `@${username}`,
        city: city.trim(),
        country: country.trim(),
        bio: bio.trim(),
        privacySettings: {
          isProfilePublic,
          defaultPublicRuns,
          protectLocation,
        },
      };
      await updateProfileDetails(payload);
      setProfile((prev) => (prev ? { ...prev, ...payload } : null));
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="py-24 text-center text-neutral-400 space-y-3">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs">Cargando perfil verídico...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-3xl p-10 text-center space-y-3">
        <div className="text-3xl">👤</div>
        <h4 className="text-sm font-bold text-white">Perfil no encontrado</h4>
        <p className="text-xs text-neutral-400">
          El usuario seleccionado no existe o no tiene datos públicos disponibles.
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl bg-neutral-800 text-xs text-white hover:bg-neutral-700"
          >
            ← Volver
          </button>
        )}
      </div>
    );
  }

  const totalKm = profile.totalDistanceKm || 0;
  const totalRuns = profile.totalRuns || 0;
  const totalDuration = profile.totalDurationSec || 0;
  const bestPace = profile.bestPaceSecPerKm;
  const longestRun = profile.longestDistanceKm || 0;
  const galleryPhotos = profile.photos || [];

  return (
    <div className="space-y-6 pb-24 animate-fade-in">
      {/* Top Bar Navigation for Profile (Back Button if opened from elsewhere) */}
      {onBack && (
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition"
          >
            <span>←</span>
            <span>Volver</span>
          </button>
          <span className="text-xs text-neutral-500">|</span>
          <span className="text-xs font-bold text-neutral-300">
            {isOwnProfile ? 'Mi Perfil' : `Perfil de ${profile.displayName}`}
          </span>
        </div>
      )}

      {/* Main Profile Card */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
          {/* Avatar with optional change button */}
          <div className="relative group">
            {profile.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName}
                className="w-24 h-24 rounded-full border-2 border-emerald-500/50 object-cover shadow-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-3xl border-2 border-emerald-500/30">
                {profile.displayName ? profile.displayName.substring(0, 2).toUpperCase() : 'RW'}
              </div>
            )}

            {isOwnProfile && (
              <>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="absolute -bottom-1 -right-1 p-2 rounded-full bg-neutral-950 border border-neutral-700 text-neutral-300 hover:text-emerald-400 hover:border-emerald-500 transition shadow-md"
                  title="Cambiar foto de perfil"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M4 4h3l2-2h6l2 2h3a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm8 3a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z" />
                  </svg>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </>
            )}
          </div>

          {/* User Information and Action Buttons */}
          <div className="flex-1 space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-white">{profile.displayName}</h2>
                <div className="text-xs font-semibold text-emerald-400 font-mono">
                  {profile.username || '@corredor'}
                </div>
              </div>

              {/* Action: Edit Profile (Own) or Follow / Unfollow (Other) */}
              {isOwnProfile ? (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition shadow-sm self-center sm:self-auto"
                >
                  {isEditing ? 'Cerrar Edición' : 'Editar Perfil'}
                </button>
              ) : (
                <button
                  onClick={handleToggleFollow}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-md self-center sm:self-auto ${
                    isFollowing
                      ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-700'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 shadow-emerald-500/20'
                  }`}
                >
                  {isFollowing ? '✓ Siguiendo' : '＋ Seguir'}
                </button>
              )}
            </div>

            {/* City & Country */}
            {(profile.city || profile.country) && (
              <div className="text-xs text-neutral-300 flex items-center justify-center sm:justify-start gap-1 pt-1">
                <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>
                  {[profile.city, profile.country].filter(Boolean).join(', ')}
                </span>
              </div>
            )}

            {/* Biography */}
            {profile.bio && (
              <p className="text-xs text-neutral-300 pt-2 leading-relaxed italic max-w-xl">
                "{profile.bio}"
              </p>
            )}

            {/* REAL Social Counters (Followers, Following, Publications) */}
            <div className="flex items-center justify-center sm:justify-start gap-6 pt-4 text-xs">
              {/* Publications counter */}
              <button
                onClick={() => setActiveTab('posts')}
                className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer text-left"
                title="Ver publicaciones"
              >
                <span className="font-black text-white font-mono text-sm">
                  {postsCount}
                </span>
                <span className="text-neutral-400">
                  {postsCount === 1 ? 'publicación' : 'publicaciones'}
                </span>
              </button>

              <span className="text-neutral-700">•</span>

              {/* Followers counter - Clickable to open real list */}
              <button
                onClick={() => setFollowListModal('followers')}
                className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer text-left group"
                title="Ver seguidores reales"
              >
                <span className="font-black text-white group-hover:text-emerald-400 font-mono text-sm transition">
                  {followersCount}
                </span>
                <span className="text-neutral-400 group-hover:text-neutral-200 transition">
                  {followersCount === 1 ? 'seguidor' : 'seguidores'}
                </span>
              </button>

              <span className="text-neutral-700">•</span>

              {/* Following counter - Clickable to open real list */}
              <button
                onClick={() => setFollowListModal('following')}
                className="flex items-center gap-1.5 hover:opacity-80 transition cursor-pointer text-left group"
                title="Ver personas seguidas"
              >
                <span className="font-black text-white group-hover:text-emerald-400 font-mono text-sm transition">
                  {followingCount}
                </span>
                <span className="text-neutral-400 group-hover:text-neutral-200 transition">
                  siguiendo
                </span>
              </button>
            </div>
          </div>
        </div>

        {saveSuccess && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            ✓ Perfil y privacidad actualizados correctamente en la base de datos.
          </div>
        )}

        {/* Edit Profile Form (Only for own profile) */}
        {isOwnProfile && isEditing && (
          <form onSubmit={handleSaveProfile} className="mt-6 pt-6 border-t border-neutral-800 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Datos Personales
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre de corredor"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Nombre de Usuario (@)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="@usuario"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Ciudad</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ej. Madrid, Buenos Aires, CDMX..."
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">País</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Ej. España, Argentina, México..."
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Biografía</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Objetivos deportivos, distancias, motivaciones..."
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            {/* Privacy Section */}
            <div className="pt-3 border-t border-neutral-800/80 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                🔒 Configuración de Privacidad
              </h4>

              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs">
                <div>
                  <div className="font-semibold text-white">Perfil Público</div>
                  <div className="text-neutral-400">Permitir a otros corredores ver tu perfil en la comunidad</div>
                </div>
                <input
                  type="checkbox"
                  checked={isProfilePublic}
                  onChange={(e) => setIsProfilePublic(e.target.checked)}
                  className="rounded border-neutral-700 text-emerald-500 focus:ring-emerald-500 bg-neutral-900 w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs">
                <div>
                  <div className="font-semibold text-white">Carreras Públicas por Defecto</div>
                  <div className="text-neutral-400">Compartir nuevas carreras en la sección Explorar</div>
                </div>
                <input
                  type="checkbox"
                  checked={defaultPublicRuns}
                  onChange={(e) => setDefaultPublicRuns(e.target.checked)}
                  className="rounded border-neutral-700 text-emerald-500 focus:ring-emerald-500 bg-neutral-900 w-4 h-4 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 text-xs">
                <div>
                  <div className="font-semibold text-white">Proteger Ubicación de Inicio y Fin</div>
                  <div className="text-neutral-400">Ocultar las coordenadas exactas de residencia</div>
                </div>
                <input
                  type="checkbox"
                  checked={protectLocation}
                  onChange={(e) => setProtectLocation(e.target.checked)}
                  className="rounded border-neutral-700 text-emerald-500 focus:ring-emerald-500 bg-neutral-900 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold transition disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Profile Section Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('posts')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'posts'
              ? 'bg-neutral-800 text-emerald-400 border border-neutral-700'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          📸 Publicaciones ({postsCount})
        </button>

        <button
          onClick={() => setActiveTab('runs')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'runs'
              ? 'bg-neutral-800 text-emerald-400 border border-neutral-700'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          🏃 Carreras ({isOwnProfile ? totalRuns : userRuns.length})
        </button>

        <button
          onClick={() => setActiveTab('stats')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'stats'
              ? 'bg-neutral-800 text-emerald-400 border border-neutral-700'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          📊 Estadísticas
        </button>

        <button
          onClick={() => setActiveTab('photos')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
            activeTab === 'photos'
              ? 'bg-neutral-800 text-emerald-400 border border-neutral-700'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          📷 Galería ({galleryPhotos.length})
        </button>
      </div>

      {/* TAB 1: USER POSTS / PUBLICACIONES */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              {isOwnProfile ? 'Mis Publicaciones' : `Publicaciones de ${profile.displayName}`}
            </h3>

            {isOwnProfile && (
              <button
                onClick={() => setShowCreatePost(true)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition shadow-sm flex items-center gap-1.5"
              >
                <span>➕</span>
                <span>Nueva Publicación</span>
              </button>
            )}
          </div>

          {loadingPosts ? (
            <div className="p-12 text-center text-neutral-400 flex items-center justify-center gap-2 text-xs">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Cargando publicaciones reales...</span>
            </div>
          ) : userPosts.length === 0 ? (
            <div className="p-10 rounded-3xl bg-neutral-900/40 border border-dashed border-neutral-800 text-center space-y-2">
              <div className="text-3xl">📸</div>
              <h4 className="text-sm font-bold text-white">
                {isOwnProfile ? 'Aún no has compartido publicaciones' : 'Sin publicaciones'}
              </h4>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                {isOwnProfile
                  ? 'Comparte fotos de tus recorridos, zapatillas o logros para que aparezcan en tu perfil y en la comunidad.'
                  : 'Este corredor aún no ha publicado actividades en la comunidad.'}
              </p>
              {isOwnProfile && (
                <button
                  onClick={() => setShowCreatePost(true)}
                  className="mt-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-emerald-400 text-xs font-bold"
                >
                  Crear primera publicación
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {userPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className="p-4 rounded-2xl bg-neutral-900/80 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer flex flex-col justify-between group shadow-sm"
                >
                  <div>
                    {/* Post photo preview if present */}
                    {post.photoURL && (
                      <div className="w-full aspect-video rounded-xl overflow-hidden bg-neutral-950 mb-3 border border-neutral-800">
                        <img
                          src={post.photoURL}
                          alt="Foto de publicación"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </div>
                    )}

                    {/* Attached Run Snippet */}
                    {post.runActivity && (
                      <div className="mb-2.5 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-bold">🏃</span>
                          <span className="font-semibold text-white truncate max-w-[140px]">
                            {post.runActivity.title}
                          </span>
                        </div>
                        <span className="font-mono text-emerald-400 font-bold">
                          {formatDistance(post.runActivity.distanceKm)}
                        </span>
                      </div>
                    )}

                    {/* Post Caption */}
                    {post.text && (
                      <p className="text-xs text-neutral-200 line-clamp-3 leading-relaxed mb-3">
                        {post.text}
                      </p>
                    )}
                  </div>

                  {/* Post Footer (Date, Likes, Comments) */}
                  <div className="pt-2.5 border-t border-neutral-800/80 flex items-center justify-between text-[11px] text-neutral-400">
                    <div className="flex items-center gap-1.5">
                      <span>{formatDate(post.createdAt)}</span>
                      {(post.visibility === 'public' || !post.visibility) && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          🌎 Pública
                        </span>
                      )}
                      {post.visibility === 'followers' && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          👥 Seguidores
                        </span>
                      )}
                      {post.visibility === 'private' && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                          🔒 Privada
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                      <span>❤️ {post.likes.length}</span>
                      <span>💬 {post.commentsCount || 0}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RUNS LIST */}
      {activeTab === 'runs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              {isOwnProfile ? 'Mis Carreras Registradas' : `Actividades de ${profile.displayName}`}
            </h3>
          </div>

          {loadingRuns ? (
            <div className="p-10 text-center text-neutral-400 flex items-center justify-center gap-2 text-xs">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Cargando carreras...</span>
            </div>
          ) : userRuns.length === 0 ? (
            <div className="p-8 rounded-2xl bg-neutral-900/40 border border-dashed border-neutral-800 text-center text-neutral-400 text-xs space-y-2.5">
              <p>
                {isOwnProfile
                  ? 'Todavía no tienes carreras guardadas. ¡Inicia una carrera con GPS!'
                  : isFollowing
                  ? 'Este corredor no tiene carreras registradas en este momento.'
                  : 'Este corredor no tiene actividades públicas disponibles. Sus carreras para seguidores serán visibles si comienzas a seguirlo.'}
              </p>
              {!isOwnProfile && !isFollowing && (
                <button
                  onClick={handleToggleFollow}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition"
                >
                  Seguir a {profile.displayName}
                </button>
              )}
            </div>
          ) : (
            userRuns.map((run) => (
              <div
                key={run.id}
                onClick={() => setSelectedRun(run)}
                className="p-4 rounded-2xl bg-neutral-900/80 hover:bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{run.title}</span>
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
                    {run.visibility === 'private' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700/60">
                        🔒 Privada
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-400">{formatDate(run.startedAt)}</div>
                  <div className="flex items-center gap-3 pt-1 text-xs font-mono">
                    <span className="text-emerald-400 font-bold">{formatDistance(run.distanceKm)}</span>
                    <span className="text-neutral-500">•</span>
                    <span className="text-neutral-300">{formatDuration(run.durationSeconds)}</span>
                    <span className="text-neutral-500">•</span>
                    <span className="text-neutral-400">{formatPace(run.avgPaceSecondsPerKm)}</span>
                  </div>
                </div>
                <div className="text-neutral-500 text-xs font-semibold">Ver mapa →</div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: STATS & RECORDS */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Aggregate Stats Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 px-1">
              Estadísticas Reales Acumuladas
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  Kilómetros Reales
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

              <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 col-span-2 sm:col-span-1">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">
                  Tiempo Total Real
                </div>
                <div className="text-2xl font-black font-mono text-white">
                  {formatDuration(totalDuration)}
                </div>
              </div>
            </div>
          </div>

          {/* Personal Records Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3 px-1">
              Récords Personales Verídicos
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xl">
                  ⚡
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Mejor Ritmo Medio</div>
                  <div className="text-xl font-black font-mono text-white">
                    {bestPace ? formatPace(bestPace) : '--:-- /km'}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl">
                  🏁
                </div>
                <div>
                  <div className="text-xs text-neutral-400">Carrera Más Larga</div>
                  <div className="text-xl font-black font-mono text-white">
                    {longestRun > 0 ? formatDistance(longestRun) : '0.00 km'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PHOTOS GALLERY */}
      {activeTab === 'photos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Fotos del Corredor
            </h4>

            {isOwnProfile && (
              <>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <span>📸 Subir Foto</span>
                </button>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={handleGalleryUpload}
                />
              </>
            )}
          </div>

          {galleryPhotos.length === 0 ? (
            <div className="p-8 rounded-2xl bg-neutral-900/40 border border-dashed border-neutral-800 text-center space-y-2">
              <div className="text-3xl">📷</div>
              <p className="text-xs text-neutral-400">
                {isOwnProfile
                  ? 'Aún no has subido fotos a tu perfil. Comparte tus carreras, zapatillas o medallas.'
                  : 'Este corredor aún no ha agregado fotos a su galería.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {galleryPhotos.map((photo, index) => (
                <div
                  key={index}
                  className="relative group rounded-2xl overflow-hidden aspect-square border border-neutral-800 bg-neutral-950"
                >
                  <img src={photo} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                  {isOwnProfile && (
                    <button
                      onClick={() => removeGalleryPhoto(index)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-neutral-950/80 text-neutral-300 hover:text-red-400 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow"
                      title="Eliminar foto"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Account & Logout (Only for own profile) */}
      {isOwnProfile && (
        <div className="pt-4 border-t border-neutral-800 space-y-3">
          <button
            onClick={logout}
            className="w-full py-3.5 px-4 rounded-2xl bg-neutral-900 hover:bg-red-950/40 border border-neutral-800 hover:border-red-500/40 text-neutral-300 hover:text-red-400 text-sm font-bold transition flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Cerrar Sesión</span>
          </button>

          <p className="text-center text-xs text-neutral-500 pt-1">
            Diseñado por <span className="text-emerald-400 font-semibold">Estevan Biganzoli</span>
          </p>
        </div>
      )}

      {/* Modal: Real Followers or Following List */}
      {followListModal && (
        <FollowListModal
          userId={targetUserId}
          type={followListModal}
          onClose={() => setFollowListModal(null)}
          onOpenUserProfile={(navUserId) => {
            setFollowListModal(null);
            if (onOpenUserProfile) {
              onOpenUserProfile(navUserId);
            }
          }}
        />
      )}

      {/* Modal: Post Detail (Full Photo, Caption, Comments, Likes, Edit, Delete) */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onPostDeleted={() => {
            setUserPosts((prev) => prev.filter((p) => p.id !== selectedPost.id));
            setPostsCount((prev) => Math.max(0, prev - 1));
            setSelectedPost(null);
          }}
          onPostUpdated={(updated) => {
            setUserPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPost(updated);
          }}
          onOpenUserProfile={(navUserId) => {
            setSelectedPost(null);
            if (onOpenUserProfile) {
              onOpenUserProfile(navUserId);
            }
          }}
        />
      )}

      {/* Modal: Create Post (Available directly from profile) */}
      {showCreatePost && (
        <CreatePostModal
          onClose={() => setShowCreatePost(false)}
          onPostCreated={() => {
            fetchPosts();
            setShowCreatePost(false);
          }}
        />
      )}

      {/* Modal: Run Detail */}
      {selectedRun && (
        <RunDetailModal
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
          onDeleted={() => {
            fetchRuns();
            setSelectedRun(null);
          }}
        />
      )}
    </div>
  );
};
