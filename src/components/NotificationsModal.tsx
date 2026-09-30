import React, { useState, useEffect } from 'react';
import { AppNotification } from '../types/run';
import { communityService } from '../services/communityService';
import { formatDate } from '../utils/geo';

interface NotificationsModalProps {
  userId: string;
  onClose: () => void;
  onNotificationClicked?: (notif: AppNotification) => void;
  onOpenUserProfile?: (userId: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  userId,
  onClose,
  onNotificationClicked,
  onOpenUserProfile,
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to real-time notification updates
  useEffect(() => {
    setLoading(true);
    const unsubscribe = communityService.subscribeToUserNotifications(userId, (data) => {
      setNotifications(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  const handleMarkAllRead = async () => {
    await communityService.markAllNotificationsRead(notifications);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClickItem = async (notif: AppNotification) => {
    // Mark as read immediately
    if (!notif.read) {
      await communityService.markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }

    if (onNotificationClicked) {
      onNotificationClicked(notif);
    }

    // Open sender's profile
    if (notif.senderId && onOpenUserProfile) {
      onOpenUserProfile(notif.senderId);
      onClose();
    }
  };

  const getIconForType = (type: AppNotification['type']) => {
    switch (type) {
      case 'like':
        return <span className="text-rose-500">❤️</span>;
      case 'comment':
        return <span className="text-sky-400">💬</span>;
      case 'follow':
        return <span className="text-emerald-400">👤</span>;
      case 'friend_run':
        return <span className="text-amber-400">🏃</span>;
      case 'achievement':
        return <span className="text-yellow-400">🏆</span>;
      default:
        return <span>🔔</span>;
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/85 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center animate-fade-in">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <h3 className="font-bold text-white text-base">Notificaciones</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">
                {unreadCount} nuevas
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-neutral-400 hover:text-white transition px-2 py-1 rounded-lg hover:bg-neutral-800"
              >
                Marcar leídas
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="py-12 text-center text-xs text-neutral-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Cargando notificaciones...
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 space-y-2">
              <div className="text-3xl">📭</div>
              <p className="text-xs font-semibold text-neutral-300">No tienes notificaciones por el momento.</p>
              <p className="text-[11px] text-neutral-500">
                Cuando alguien te siga, comente o dé me gusta, lo verás reflejado aquí al instante.
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleClickItem(notif)}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-start gap-3 group ${
                  notif.read
                    ? 'bg-neutral-950/40 border-neutral-800/60 opacity-80 hover:opacity-100 hover:border-neutral-700'
                    : 'bg-neutral-900 border-emerald-500/40 shadow-sm hover:border-emerald-500/60'
                }`}
              >
                <div className="relative flex-shrink-0">
                  {notif.senderPhotoURL ? (
                    <img
                      src={notif.senderPhotoURL}
                      alt={notif.senderName}
                      className="w-10 h-10 rounded-full object-cover border border-neutral-700"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs border border-emerald-500/30">
                      {notif.senderName ? notif.senderName.substring(0, 2).toUpperCase() : 'RW'}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1 text-xs bg-neutral-950 rounded-full p-0.5 shadow">
                    {getIconForType(notif.type)}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition">
                      {notif.senderName}
                    </span>
                    {notif.senderUsername && (
                      <span className="text-[11px] text-emerald-400/80 font-mono">
                        {notif.senderUsername}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutral-200 leading-relaxed font-medium mt-0.5">
                    {notif.message}
                  </p>

                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-neutral-500">
                      {formatDate(notif.createdAt)}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-semibold opacity-0 group-hover:opacity-100 transition">
                      Ver perfil →
                    </span>
                  </div>
                </div>

                {!notif.read && (
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5 shadow-sm shadow-emerald-500/50" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
