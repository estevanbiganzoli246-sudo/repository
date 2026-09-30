import React, { useState, useEffect } from 'react';
import { CommunityPost, PostComment } from '../types/run';
import { communityService } from '../services/communityService';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/geo';

interface PostCommentsModalProps {
  post: CommunityPost;
  onClose: () => void;
  onCommentAdded: () => void;
  onOpenUserProfile?: (userId: string) => void;
}

export const PostCommentsModal: React.FC<PostCommentsModalProps> = ({
  post,
  onClose,
  onCommentAdded,
  onOpenUserProfile,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const data = await communityService.getComments(post.id);
      setComments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [post.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !currentUser) return;

    setSubmitting(true);
    try {
      await communityService.addComment(post.id, post.userId, {
        postId: post.id,
        userId: currentUser.uid,
        authorName: userProfile?.displayName || currentUser.displayName || 'Corredor',
        authorPhotoURL: userProfile?.photoURL || currentUser.photoURL || null,
        text: newText.trim(),
      });
      setNewText('');
      await fetchComments();
      onCommentAdded();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/85 backdrop-blur-md p-4 sm:p-6 flex items-center justify-center">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">💬</span>
            <h3 className="font-bold text-white text-sm sm:text-base">
              Comentarios ({comments.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Original Post Snippet */}
        <div
          onClick={() => {
            if (onOpenUserProfile) {
              onOpenUserProfile(post.userId);
              onClose();
            }
          }}
          className="p-3.5 bg-neutral-950/50 border-b border-neutral-800/80 text-xs flex items-center gap-3 cursor-pointer hover:bg-neutral-900/60 transition group"
        >
          {post.authorPhotoURL ? (
            <img
              src={post.authorPhotoURL}
              alt={post.authorName}
              className="w-8 h-8 rounded-full object-cover border border-neutral-700"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-300">
              {post.authorName.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1 truncate">
            <span className="font-bold text-white group-hover:text-emerald-400 mr-1.5 transition">
              {post.authorName}:
            </span>
            <span className="text-neutral-400">{post.text}</span>
          </div>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-10 text-center text-xs text-neutral-400">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              Cargando comentarios...
            </div>
          ) : comments.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 space-y-1">
              <div className="text-2xl mb-1">🗨️</div>
              <p className="text-xs font-semibold text-neutral-300">Sin comentarios aún</p>
              <p className="text-[11px] text-neutral-500">Sé el primero en felicitar a este corredor.</p>
            </div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex items-start gap-3 text-xs">
                <div
                  onClick={() => {
                    if (onOpenUserProfile) {
                      onOpenUserProfile(comment.userId);
                      onClose();
                    }
                  }}
                  className="cursor-pointer"
                >
                  {comment.authorPhotoURL ? (
                    <img
                      src={comment.authorPhotoURL}
                      alt={comment.authorName}
                      className="w-8 h-8 rounded-full object-cover border border-neutral-700 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-neutral-300 flex-shrink-0">
                      {comment.authorName.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 bg-neutral-950/60 p-3 rounded-2xl border border-neutral-800/80">
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
                    <span className="text-[10px] text-neutral-500">{formatDate(comment.createdAt)}</span>
                  </div>
                  <p className="text-neutral-300 leading-relaxed">{comment.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Comment input form */}
        <form onSubmit={handleSubmit} className="p-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Añadir un comentario..."
            maxLength={300}
            className="flex-1 px-4 py-2.5 rounded-full bg-neutral-900 border border-neutral-800 text-white text-xs focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={submitting || !newText.trim()}
            className="px-4 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition disabled:opacity-40"
          >
            {submitting ? '...' : 'Publicar'}
          </button>
        </form>
      </div>
    </div>
  );
};
