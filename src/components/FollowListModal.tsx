import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types/run';
import { communityService } from '../services/communityService';
import { useAuth } from '../context/AuthContext';
import { formatDistance } from '../utils/geo';

interface FollowListModalProps {
  userId: string;
  type: 'followers' | 'following';
  onClose: () => void;
  onOpenUserProfile: (targetUserId: string) => void;
}

export const FollowListModal: React.FC<FollowListModalProps> = ({
  userId,
  type,
  onClose,
  onOpenUserProfile,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [myFollowingIds, setMyFollowingIds] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [list, myFollowing] = await Promise.all([
          type === 'followers'
            ? communityService.getUserFollowersList(userId)
            : communityService.getUserFollowingList(userId),
          currentUser ? communityService.getFollowingIds(currentUser.uid) : Promise.resolve([]),
        ]);
        if (isMounted) {
          setUsers(list);
          setMyFollowingIds(myFollowing);
        }
      } catch (err) {
        console.error('Error loading follow list:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [userId, type, currentUser]);

  const handleToggleFollow = async (targetUser: UserProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    const isCurrentlyFollowing = myFollowingIds.includes(targetUser.uid);

    if (isCurrentlyFollowing) {
      setMyFollowingIds((prev) => prev.filter((id) => id !== targetUser.uid));
      await communityService.unfollowUser(currentUser.uid, targetUser.uid);
    } else {
      setMyFollowingIds((prev) => [...prev, targetUser.uid]);
      await communityService.followUser(
        currentUser.uid,
        targetUser.uid,
        userProfile?.displayName || currentUser.displayName || 'Corredor',
        userProfile?.photoURL || currentUser.photoURL || null
      );
    }
  };

  const title = type === 'followers' ? 'Seguidores' : 'Siguiendo';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/85 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center animate-fade-in">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">👥</span>
            <h3 className="font-bold text-white text-base">
              {title} <span className="text-neutral-500 font-mono text-sm">({users.length})</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Cargando {title.toLowerCase()} reales...
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 space-y-1">
              <div className="text-3xl mb-1">🏃</div>
              <p className="text-xs font-semibold text-neutral-300">
                {type === 'followers'
                  ? 'Aún no tiene seguidores'
                  : 'Aún no sigue a ningún corredor'}
              </p>
              <p className="text-[11px] text-neutral-500">
                Los vínculos deportivos reales se mostrarán aquí.
              </p>
            </div>
          ) : (
            users.map((user) => {
              const isSelf = user.uid === currentUser?.uid;
              const isFollowing = myFollowingIds.includes(user.uid);

              return (
                <div
                  key={user.uid}
                  onClick={() => {
                    onOpenUserProfile(user.uid);
                    onClose();
                  }}
                  className="p-3 rounded-2xl bg-neutral-950/60 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700 transition cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName}
                        className="w-10 h-10 rounded-full object-cover border border-neutral-700 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs flex-shrink-0">
                        {user.displayName ? user.displayName.substring(0, 2).toUpperCase() : 'RW'}
                      </div>
                    )}
                    <div className="truncate">
                      <div className="text-sm font-bold text-white group-hover:text-emerald-400 transition truncate">
                        {user.displayName}
                      </div>
                      <div className="text-xs text-neutral-400 font-mono truncate">
                        {user.username || '@corredor'}
                      </div>
                      {user.totalDistanceKm ? (
                        <div className="text-[10px] text-emerald-400 font-mono">
                          {formatDistance(user.totalDistanceKm)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {!isSelf && (
                    <button
                      onClick={(e) => handleToggleFollow(user, e)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex-shrink-0 ml-2 ${
                        isFollowing
                          ? 'bg-neutral-800 text-neutral-400 hover:text-white'
                          : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400 shadow-sm'
                      }`}
                    >
                      {isFollowing ? 'Siguiendo' : 'Seguir'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
