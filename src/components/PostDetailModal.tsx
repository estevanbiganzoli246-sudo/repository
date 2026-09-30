import React, { useState, useEffect } from 'react';
import { CommunityPost, PostComment } from '../types/run';
import { communityService } from '../services/communityService';
import { useAuth } from '../context/AuthContext';
import { formatDistance, formatDuration, formatPace, formatDate } from '../utils/geo';

interface PostDetailModalProps {
  post: CommunityPost;
  onClose: () => void;
  onPostDeleted?: () => void;
  onPostUpdated?: (updatedPost: CommunityPost) => void;
  onOpenUserProfile?: (userId: string) => void;
}

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  post: initialPost,
  onClose,
  onPostDeleted,
  onPostUpdated,
  onOpenUserProfile,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [post, setPost] = useState<CommunityPost>(initialPost);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Edit caption state
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [editedCaption, setEditedCaption] = useState(post.text);
  const [isSavingCaption, setIsSavingCaption] = useState(false);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const isAuthor = currentUser?.uid === post.userId;
  const isLiked = currentUser ? post.likes.includes(currentUser.uid) : false;

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const data = await communityService.getComments(post.id);
      setComments(data);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [post.id]);

  const handleToggleLike = async () => {
    if (!currentUser) return;
    const nextIsLiked = !isLiked;
    const nextLikes = nextIsLiked
      ? [...post.likes, currentUser.uid]
      : post.likes.filter((id) => id !== currentUser.uid);

    const updated = { ...post, likes: nextLikes };
    setPost(updated);
    if (onPostUpdated) onPostUpdated(updated);

    await communityService.toggleLike(
      post.id,
      post.userId,
      currentUser.uid,
      userProfile?.displayName || currentUser.displayName || 'Corredor',
      userProfile?.photoURL || currentUser.photoURL || null
    );
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !currentUser) return;

    setIsSubmittingComment(true);
    try {
      const newComment = await communityService.addComment(post.id, post.userId, {
        postId: post.id,
        userId: currentUser.uid,
        authorName: userProfile?.displayName || currentUser.displayName || 'Corredor',
        authorPhotoURL: userProfile?.photoURL || currentUser.photoURL || null,
        text: newCommentText.trim(),
      });
      setComments((prev) => [...prev, newComment]);
      setNewCommentText('');
      const updated = { ...post, commentsCount: (post.commentsCount || 0) + 1 };
      setPost(updated);
      if (onPostUpdated) onPostUpdated(updated);
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleSaveCaption = async () => {
    if (!isAuthor) return;
    setIsSavingCaption(true);
    try {
      await communityService.updatePostText(post.id, editedCaption.trim());
      const updated = { ...post, text: editedCaption.trim() };
      setPost(updated);
      setIsEditingCaption(false);
      if (onPostUpdated) onPostUpdated(updated);
    } catch (err) {
      console.error('Error saving caption:', err);
    } finally {
      setIsSavingCaption(false);
    }
  };

  const handleDeletePost = async () => {
    if (!isAuthor || !currentUser) return;
    setIsDeleting(true);
    try {
      await communityService.deletePost(post.id, currentUser.uid);
      if (onPostDeleted) onPostDeleted();
      onClose();
    } catch (err) {
      console.error('Error deleting post:', err);
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/90 backdrop-blur-md p-3 sm:p-6 flex items-center justify-center animate-fade-in">
      <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/40">
          <div
            onClick={() => {
              if (onOpenUserProfile) {
                onOpenUserProfile(post.userId);
                onClose();
              }
            }}
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
              <div className="text-[11px] text-neutral-500 flex items-center gap-1.5 flex-wrap">
                {post.location && <span>📍 {post.location} • </span>}
                <span>{formatDate(post.createdAt)}</span>
                <span className="text-neutral-600">•</span>
                {(post.visibility === 'public' || !post.visibility) && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    🌎 Pública
                  </span>
                )}
                {post.visibility === 'followers' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    👥 Seguidores
                  </span>
                )}
                {post.visibility === 'private' && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700/60">
                    🔒 Privada
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthor && (
              <>
                <button
                  onClick={() => setIsEditingCaption(!isEditingCaption)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition"
                  title="Editar texto de la publicación"
                >
                  ✏️ Editar
                </button>
                <button
                  onClick={() => setShowConfirmDelete(true)}
                  className="px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-500/30 text-xs font-semibold transition"
                  title="Eliminar publicación"
                >
                  🗑️ Eliminar
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Delete Confirmation Banner */}
        {showConfirmDelete && (
          <div className="p-4 bg-red-950/60 border-b border-red-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-red-200 font-medium text-center sm:text-left">
              ¿Seguro que deseas eliminar esta publicación de la base de datos? Esta acción es permanente.
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-3 py-1.5 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeletePost}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 disabled:opacity-50"
              >
                {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto space-y-4 p-4 sm:p-6">
          {/* Full Photo */}
          {post.photoURL && (
            <div className="w-full rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-inner">
              <img
                src={post.photoURL}
                alt="Foto completa de la publicación"
                className="w-full max-h-[460px] object-contain mx-auto"
              />
            </div>
          )}

          {/* Caption / Text */}
          {isEditingCaption ? (
            <div className="p-3.5 rounded-2xl bg-neutral-950 border border-neutral-700 space-y-2">
              <textarea
                value={editedCaption}
                onChange={(e) => setEditedCaption(e.target.value)}
                rows={3}
                className="w-full bg-transparent text-sm text-white focus:outline-none resize-none"
                placeholder="Escribe el texto de tu publicación..."
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setEditedCaption(post.text);
                    setIsEditingCaption(false);
                  }}
                  className="px-3 py-1 rounded-xl bg-neutral-800 text-neutral-300 text-xs"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveCaption}
                  disabled={isSavingCaption}
                  className="px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs"
                >
                  {isSavingCaption ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            post.text && (
              <p className="text-sm text-neutral-200 leading-relaxed whitespace-pre-line px-1">
                {post.text}
              </p>
            )
          )}

          {/* Attached Running Activity Card */}
          {post.runActivity && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-neutral-950 border border-emerald-500/30 flex items-center justify-between shadow-inner">
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

          {/* Interactions bar */}
          <div className="flex items-center justify-between py-2 border-y border-neutral-800 text-xs">
            <button
              onClick={handleToggleLike}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition ${
                isLiked
                  ? 'bg-rose-500/10 text-rose-500 font-bold border border-rose-500/20'
                  : 'text-neutral-400 hover:text-white bg-neutral-950/60'
              }`}
            >
              <span className="text-base">{isLiked ? '❤️' : '🤍'}</span>
              <span>{post.likes.length} {post.likes.length === 1 ? 'Me gusta' : 'Me gustas'}</span>
            </button>

            <span className="text-neutral-400 font-mono">
              💬 {comments.length} comentarios
            </span>
          </div>

          {/* Comments section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Comentarios
            </h4>

            {loadingComments ? (
              <div className="py-8 text-center text-xs text-neutral-400">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Cargando comentarios...
              </div>
            ) : comments.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-500">
                Sé el primero en comentar esta publicación.
              </div>
            ) : (
              <div className="space-y-2.5">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex items-start gap-3 text-xs">
                    <div
                      onClick={() => {
                        if (onOpenUserProfile) {
                          onOpenUserProfile(comment.userId);
                          onClose();
                        }
                      }}
                      className="cursor-pointer flex-shrink-0"
                    >
                      {comment.authorPhotoURL ? (
                        <img
                          src={comment.authorPhotoURL}
                          alt={comment.authorName}
                          className="w-7 h-7 rounded-full object-cover border border-neutral-700"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-300">
                          {comment.authorName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 bg-neutral-950/70 p-3 rounded-2xl border border-neutral-800">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          onClick={() => {
                            if (onOpenUserProfile) {
                              onOpenUserProfile(comment.userId);
                              onClose();
                            }
                          }}
                          className="font-bold text-white hover:text-emerald-400 cursor-pointer transition"
                        >
                          {comment.authorName}
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-neutral-300 leading-relaxed">{comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add Comment Input Footer */}
        <form
          onSubmit={handleAddComment}
          className="p-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Escribe un comentario..."
            maxLength={300}
            className="flex-1 px-4 py-2.5 rounded-full bg-neutral-900 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={isSubmittingComment || !newCommentText.trim()}
            className="px-4 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition disabled:opacity-40"
          >
            {isSubmittingComment ? '...' : 'Enviar'}
          </button>
        </form>
      </div>
    </div>
  );
};
