import React, { useState, useEffect, useCallback } from 'react';
import { CommunityPost, UserProfile, RunData } from '../types/run';
import { communityService } from '../services/communityService';
import { runService } from '../services/runService';
import { useAuth } from '../context/AuthContext';
import { formatDistance, formatDuration, formatPace, formatDate } from '../utils/geo';
import { CreatePostModal } from '../components/CreatePostModal';
import { PostCommentsModal } from '../components/PostCommentsModal';
import { PostDetailModal } from '../components/PostDetailModal';

interface CommunityViewProps {
  onOpenUserProfile?: (userId: string) => void;
}

export const CommunityView: React.FC<CommunityViewProps> = ({ onOpenUserProfile }) => {
  const { currentUser, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'feed' | 'friends' | 'leaderboard'>('feed');

  // Feed State
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [selectedPostForComments, setSelectedPostForComments] = useState<CommunityPost | null>(null);
  const [selectedPostForDetail, setSelectedPostForDetail] = useState<CommunityPost | null>(null);

  // Friends & Suggestions State
  const [suggestions, setSuggestions] = useState<UserProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);

  // Leaderboard State
  const [runners, setRunners] = useState<UserProfile[]>([]);
  const [loadingRunners, setLoadingRunners] = useState(true);

  // Share feedback toast
  const [shareToast, setShareToast] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const data = await communityService.getPosts();
      setPosts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  const fetchFollowing = useCallback(async () => {
    if (!currentUser) return;
    try {
      const ids = await communityService.getFollowingIds(currentUser.uid);
      setFollowingIds(ids);
    } catch (err) {
      console.error(err);
    }
  }, [currentUser]);

  const fetchSuggestions = useCallback(async () => {
    if (!currentUser) return;
    setLoadingSuggestions(true);
    try {
      const sugs = await communityService.getRealSuggestions(currentUser.uid);
      setSuggestions(sugs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [currentUser]);

  const fetchLeaderboard = useCallback(async () => {
    setLoadingRunners(true);
    try {
      const community = await runService.getCommunityRunners();
      setRunners(community);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRunners(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    fetchFollowing();
  }, [fetchFeed, fetchFollowing]);

  useEffect(() => {
    if (activeTab === 'friends') {
      fetchSuggestions();
    } else if (activeTab === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [activeTab, fetchSuggestions, fetchLeaderboard]);

  const handleToggleLike = async (post: CommunityPost) => {
    if (!currentUser) return;
    const isLiked = post.likes.includes(currentUser.uid);

    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === post.id) {
          return {
            ...p,
            likes: isLiked
              ? p.likes.filter((id) => id !== currentUser.uid)
              : [...p.likes, currentUser.uid],
          };
        }
        return p;
      })
    );

    await communityService.toggleLike(
      post.id,
      post.userId,
      currentUser.uid,
      userProfile?.displayName || currentUser.displayName || 'Corredor',
      userProfile?.photoURL || currentUser.photoURL || null
    );
  };

  const handleToggleSave = async (postId: string) => {
    if (!currentUser) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const isSaved = post.savedBy?.includes(currentUser.uid);
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const newSaved = isSaved
            ? (p.savedBy || []).filter((id) => id !== currentUser.uid)
            : [...(p.savedBy || []), currentUser.uid];
          return { ...p, savedBy: newSaved };
        }
        return p;
      })
    );

    await communityService.toggleSave(postId, currentUser.uid);
  };

  const handleToggleFollow = async (targetUserId: string) => {
    if (!currentUser) return;
    const isCurrentlyFollowing = followingIds.includes(targetUserId);

    if (isCurrentlyFollowing) {
      setFollowingIds((prev) => prev.filter((id) => id !== targetUserId));
      await communityService.unfollowUser(currentUser.uid, targetUserId);
    } else {
      setFollowingIds((prev) => [...prev, targetUserId]);
      await communityService.followUser(
        currentUser.uid,
        targetUserId,
        userProfile?.displayName || currentUser.displayName || 'Corredor',
        userProfile?.photoURL || currentUser.photoURL || null
      );
    }
  };

  const handleShare = async (post: CommunityPost) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Actividad de ${post.authorName} en RunWorld`,
          text: post.text || 'Mira esta actividad de running en RunWorld',
          url: window.location.href,
        });
        return;
      } catch (e) {
        // Fallback to clipboard
      }
    }
    navigator.clipboard.writeText(window.location.href);
    setShareToast('Enlace copiado al portapapeles');
    setTimeout(() => setShareToast(null), 3000);
  };

  const filteredSuggestions = suggestions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.displayName.toLowerCase().includes(q) ||
      (s.username && s.username.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5 pb-24">
      {/* View Header with Sub-tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-white">Comunidad RunWorld</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Interacciones atléticas, amigos reales y entrenamientos verificados.
          </p>
        </div>

        {/* Create Post Button */}
        <button
          onClick={() => setShowCreatePost(true)}
          className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-xs transition shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-1.5 self-start sm:self-auto"
        >
          <span className="text-base">➕</span>
          <span>Publicar</span>
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-2xl">
        <button
          onClick={() => setActiveTab('feed')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'feed'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          📸 Feed Social
        </button>
        <button
          onClick={() => setActiveTab('friends')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'friends'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          👥 Amigos & Sugerencias
        </button>
        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'leaderboard'
              ? 'bg-neutral-800 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          🏆 Clasificación
        </button>
      </div>

      {shareToast && (
        <div className="fixed top-16 right-4 z-50 p-3 rounded-xl bg-emerald-500 text-neutral-950 font-bold text-xs shadow-xl animate-fade-in">
          {shareToast}
        </div>
      )}

      {/* TAB 1: FEED SOCIAL */}
      {activeTab === 'feed' && (
        <div className="space-y-4">
          {loadingPosts ? (
            <div className="py-16 text-center text-xs text-neutral-400">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Cargando el feed...
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-3xl p-10 text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl">
                📸
              </div>
              <h4 className="text-base font-bold text-white">El feed está en espera</h4>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Comparte una foto o tu última carrera para iniciar la conversación en la comunidad.
              </p>
              <button
                onClick={() => setShowCreatePost(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-emerald-400 font-bold text-xs"
              >
                Crear primera publicación
              </button>
            </div>
          ) : (
            posts.map((post) => {
              const isLiked = currentUser ? post.likes.includes(currentUser.uid) : false;
              const isSaved = currentUser ? post.savedBy?.includes(currentUser.uid) : false;
              const isFollowingAuthor = followingIds.includes(post.userId);
              const isSelf = post.userId === currentUser?.uid;

              return (
                <div
                  key={post.id}
                  className="bg-neutral-900/80 border border-neutral-800 rounded-3xl overflow-hidden shadow-sm hover:border-neutral-700 transition"
                >
                  {/* Post Header */}
                  <div className="p-4 sm:p-5 flex items-center justify-between">
                    <div
                      onClick={() => onOpenUserProfile && onOpenUserProfile(post.userId)}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      {post.authorPhotoURL ? (
                        <img
                          src={post.authorPhotoURL}
                          alt={post.authorName}
                          className="w-10 h-10 rounded-full object-cover border border-neutral-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                          {post.authorName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white group-hover:text-emerald-400 transition">
                            {post.authorName}
                          </span>
                          <span className="text-xs text-neutral-400 font-normal">
                            {post.authorUsername}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-500 flex items-center gap-1">
                          {post.location && (
                            <>
                              <span>📍 {post.location}</span>
                              <span>•</span>
                            </>
                          )}
                          <span>{formatDate(post.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    {!isSelf && (
                      <button
                        onClick={() => handleToggleFollow(post.userId)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                          isFollowingAuthor
                            ? 'bg-neutral-800 text-neutral-400 hover:text-white'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        {isFollowingAuthor ? 'Siguiendo' : 'Seguir'}
                      </button>
                    )}
                  </div>

                  {/* Post Text & Content (Clickable to view full details) */}
                  <div
                    onClick={() => setSelectedPostForDetail(post)}
                    className="cursor-pointer"
                  >
                    {post.text && (
                      <div className="px-4 sm:px-5 pb-3 text-sm text-neutral-200 leading-relaxed hover:text-white transition">
                        {post.text}
                      </div>
                    )}

                    {/* Attached Running Activity Card */}
                    {post.runActivity && (
                      <div className="mx-4 sm:mx-5 mb-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-neutral-950 border border-emerald-500/30 flex items-center justify-between shadow-inner hover:border-emerald-500/50 transition">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
                            🏃
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                              {post.runActivity.title}
                            </div>
                            <div className="text-base sm:text-lg font-black font-mono text-white mt-0.5 flex items-center gap-2">
                              <span>{formatDistance(post.runActivity.distanceKm)}</span>
                              <span className="text-neutral-600 text-xs">•</span>
                              <span className="text-neutral-300 text-xs sm:text-sm font-medium">
                                {formatDuration(post.runActivity.durationSeconds)}
                              </span>
                              <span className="text-neutral-600 text-xs">•</span>
                              <span className="text-emerald-400 text-xs sm:text-sm font-medium">
                                {formatPace(post.runActivity.avgPaceSecondsPerKm)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Post Photo */}
                    {post.photoURL && (
                      <div className="w-full aspect-video bg-neutral-950 overflow-hidden">
                        <img
                          src={post.photoURL}
                          alt="Foto de carrera"
                          className="w-full h-full object-cover hover:scale-[1.02] transition duration-300"
                        />
                      </div>
                    )}
                  </div>

                  {/* Interactions Bar */}
                  <div className="p-3.5 sm:p-4 flex items-center justify-between border-t border-neutral-800/80 text-xs">
                    <div className="flex items-center gap-4">
                      {/* Like Button */}
                      <button
                        onClick={() => handleToggleLike(post)}
                        className={`flex items-center gap-1.5 transition ${
                          isLiked ? 'text-rose-500 font-bold' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <span className="text-base">{isLiked ? '❤️' : '🤍'}</span>
                        <span>{post.likes.length}</span>
                      </button>

                      {/* Comment Button */}
                      <button
                        onClick={() => setSelectedPostForComments(post)}
                        className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition"
                      >
                        <span className="text-base">💬</span>
                        <span>{post.commentsCount || 0}</span>
                      </button>

                      {/* Share Button */}
                      <button
                        onClick={() => handleShare(post)}
                        className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition"
                        title="Compartir"
                      >
                        <span className="text-base">↗️</span>
                      </button>
                    </div>

                    {/* Bookmark / Save Button */}
                    <button
                      onClick={() => handleToggleSave(post.id)}
                      className={`flex items-center gap-1 transition ${
                        isSaved ? 'text-emerald-400 font-bold' : 'text-neutral-400 hover:text-white'
                      }`}
                      title="Guardar publicación"
                    >
                      <span className="text-base">{isSaved ? '🔖' : '🏷️'}</span>
                      <span className="hidden sm:inline">{isSaved ? 'Guardado' : 'Guardar'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: AMIGOS Y SUGERENCIAS REALES */}
      {activeTab === 'friends' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar corredores por nombre o @usuario..."
              className="w-full px-4 py-3 pl-10 rounded-2xl bg-neutral-900 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500"
            />
            <span className="absolute left-3.5 top-3 text-neutral-500 text-sm">🔍</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-neutral-900/40 border border-neutral-800 text-xs text-neutral-400 flex items-center gap-2">
            <span>🛡️</span>
            <span>
              Sugerencias basadas en corredores reales registrados en la plataforma. Sin perfiles inventados.
            </span>
          </div>

          {loadingSuggestions ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Buscando sugerencias reales...
            </div>
          ) : filteredSuggestions.length === 0 ? (
            <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-3xl p-10 text-center space-y-2">
              <div className="text-3xl">🤝</div>
              <h4 className="text-sm font-bold text-white">Todavía no tenemos sugerencias para ti</h4>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Conforme más deportistas se sumen y registren sus actividades, aparecerán aquí para conectar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredSuggestions.map((user) => {
                const isFollowing = followingIds.includes(user.uid);
                return (
                  <div
                    key={user.uid}
                    className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800 flex items-center justify-between"
                  >
                    <div
                      onClick={() => onOpenUserProfile && onOpenUserProfile(user.uid)}
                      className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0"
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="w-11 h-11 rounded-full object-cover border border-neutral-700 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-sm flex-shrink-0">
                          {user.displayName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="truncate">
                        <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition truncate">
                          {user.displayName}
                        </div>
                        <div className="text-xs text-neutral-400 truncate">{user.username || '@corredor'}</div>
                        <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                          {formatDistance(user.totalDistanceKm || 0)} acumulados
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleFollow(user.uid)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex-shrink-0 ml-2 ${
                        isFollowing
                          ? 'bg-neutral-800 text-neutral-400 hover:text-white'
                          : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400 shadow-md shadow-emerald-500/10'
                      }`}
                    >
                      {isFollowing ? 'Siguiendo' : 'Seguir'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CLASIFICACIÓN REAL */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-3">
          {loadingRunners ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Cargando clasificación...
            </div>
          ) : runners.length === 0 ? (
            <div className="bg-neutral-900/40 border border-dashed border-neutral-800 rounded-3xl p-10 text-center text-xs text-neutral-400">
              Sin corredores registrados aún.
            </div>
          ) : (
            runners.map((runner, index) => {
              const isMe = runner.uid === currentUser?.uid;
              return (
                <div
                  key={runner.uid}
                  onClick={() => onOpenUserProfile && onOpenUserProfile(runner.uid)}
                  className={`p-4 rounded-2xl border transition flex items-center justify-between cursor-pointer group ${
                    isMe
                      ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                      : 'bg-neutral-900/80 hover:bg-neutral-850 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs font-mono ${
                        index === 0
                          ? 'bg-amber-400/20 text-amber-300'
                          : index === 1
                          ? 'bg-slate-300/20 text-slate-300'
                          : index === 2
                          ? 'bg-amber-700/20 text-amber-600'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      #{index + 1}
                    </span>

                    {runner.photoURL ? (
                      <img
                        src={runner.photoURL}
                        alt={runner.displayName}
                        className="w-10 h-10 rounded-full object-cover border border-neutral-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                        {runner.displayName.substring(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div>
                      <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition flex items-center gap-1.5">
                        <span>{runner.displayName}</span>
                        {isMe && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded">
                            Tú
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400">{runner.username || '@corredor'}</div>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-emerald-400">
                      {formatDistance(runner.totalDistanceKm || 0)}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-sans">
                      {runner.totalRuns || 0} carreras
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal: Create Post */}
      {showCreatePost && (
        <CreatePostModal
          onClose={() => setShowCreatePost(false)}
          onPostCreated={fetchFeed}
        />
      )}

      {/* Modal: Post Comments */}
      {selectedPostForComments && (
        <PostCommentsModal
          post={selectedPostForComments}
          onClose={() => setSelectedPostForComments(null)}
          onCommentAdded={fetchFeed}
          onOpenUserProfile={onOpenUserProfile}
        />
      )}

      {/* Modal: Post Detail View */}
      {selectedPostForDetail && (
        <PostDetailModal
          post={selectedPostForDetail}
          onClose={() => setSelectedPostForDetail(null)}
          onPostDeleted={() => {
            setPosts((prev) => prev.filter((p) => p.id !== selectedPostForDetail.id));
            setSelectedPostForDetail(null);
          }}
          onPostUpdated={(updated) => {
            setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setSelectedPostForDetail(updated);
          }}
          onOpenUserProfile={(uId) => {
            setSelectedPostForDetail(null);
            if (onOpenUserProfile) onOpenUserProfile(uId);
          }}
        />
      )}
    </div>
  );
};
