import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import postService from '../../services/postService.js';
import commentService from '../../services/commentService.js';
import saveService from '../../services/saveService.js';
import reportService from '../../services/reportService.js';
import ErrorAlert from '../common/ErrorAlert.jsx';
import LoadingSpinner from '../common/LoadingSpinner.jsx';

const formatDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const ReportModal = ({ onClose, onSubmit }) => {
  const REASONS = ['SPAM', 'HARASSMENT', 'HATE_SPEECH', 'VIOLENCE', 'NUDITY', 'MISINFORMATION', 'OTHER'];
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason) { setError({ message: 'Please select a reason.' }); return; }
    setSubmitting(true);
    try {
      await onSubmit({ reason, description: description.trim() });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Report content">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Report Content</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <ErrorAlert error={error} onDismiss={() => setError(null)} />
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="report-reason">Reason</label>
            <select id="report-reason" className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} required>
              <option value="">Select a reason…</option>
              {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="report-description">Additional details (optional)</label>
            <textarea
              id="report-description"
              className="form-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="Describe the issue…"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-danger" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CommentSection = ({ postId }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    commentService.getPostComments(postId, { page: 1, limit: 5 })
      .then((res) => {
        if (!cancelled) {
          setComments(res?.data?.comments || []);
          setHasMore(res?.data?.pagination?.hasNextPage || false);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) { setError(err); setIsLoading(false); }
      });
    return () => { cancelled = true; };
  }, [postId]);

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed) return;
    setIsSubmitting(true);
    try {
      const res = await commentService.createComment(postId, trimmed);
      setComments((prev) => [res.data.comment, ...prev]);
      setNewComment('');
    } catch (err) {
      setError(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="comment-section">
      <form className="comment-form" onSubmit={handleSubmitComment}>
        <input
          type="text"
          className="form-input comment-input"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment…"
          maxLength={1000}
          disabled={isSubmitting}
        />
        <button type="submit" className="btn btn-sm btn-primary" disabled={isSubmitting || !newComment.trim()}>
          {isSubmitting ? '…' : 'Post'}
        </button>
      </form>
      <ErrorAlert error={error} onDismiss={() => setError(null)} />
      {isLoading ? (
        <LoadingSpinner size="small" />
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c._id} className="comment-item">
              <span className="comment-author">{c.author?.username || 'user'}</span>
              {/* Plain text rendering — no dangerouslySetInnerHTML */}
              <span className="comment-content">{c.content}</span>
              <span className="comment-date">{formatDate(c.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button type="button" className="link-button" onClick={() => setPage((p) => p + 1)}>
          Load more comments
        </button>
      )}
    </div>
  );
};

export const PostCard = ({ post: initialPost, onDeleted, onUpdated, onNavigate }) => {
  const { user } = useAuth();
  const [post, setPost] = useState(initialPost);
  const [isLiking, setIsLiking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState(null);

  const isOwner = user?._id === post.author?._id;

  const handleToggleLike = async () => {
    if (isLiking) return;
    setIsLiking(true);
    // Optimistic update
    setPost((prev) => ({
      ...prev,
      isLiked: !prev.isLiked,
      likesCount: prev.isLiked ? (prev.likesCount || 1) - 1 : (prev.likesCount || 0) + 1,
    }));
    try {
      const res = await postService.toggleLike(post._id);
      // Apply authoritative result
      setPost((prev) => ({
        ...prev,
        isLiked: res?.data?.isLiked ?? prev.isLiked,
        likesCount: res?.data?.likesCount ?? prev.likesCount,
      }));
    } catch (err) {
      // Revert optimistic update on error
      setPost((prev) => ({
        ...prev,
        isLiked: !prev.isLiked,
        likesCount: prev.isLiked ? (prev.likesCount || 1) - 1 : (prev.likesCount || 0) + 1,
      }));
      setActionError(err);
    } finally {
      setIsLiking(false);
    }
  };

  const handleToggleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    const wasSaved = post.isSaved;
    setPost((prev) => ({ ...prev, isSaved: !prev.isSaved }));
    try {
      if (wasSaved) {
        await saveService.unsavePost(post._id);
      } else {
        await saveService.savePost(post._id);
      }
    } catch (err) {
      setPost((prev) => ({ ...prev, isSaved: wasSaved }));
      setActionError(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    setIsDeleting(true);
    try {
      await postService.deletePost(post._id);
      if (typeof onDeleted === 'function') onDeleted(post._id);
    } catch (err) {
      setActionError(err);
      setIsDeleting(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      const res = await postService.updatePost(post._id, { caption: editCaption.trim() });
      const updated = res?.data?.post;
      if (updated) {
        setPost(updated);
        if (typeof onUpdated === 'function') onUpdated(updated);
      }
      setShowEditModal(false);
    } catch (err) {
      setActionError(err);
    }
  };

  const handleReport = async ({ reason, description }) => {
    await reportService.createReport({
      targetType: 'POST',
      targetId: post._id,
      reason,
      details: description || '',
    });
  };

  return (
    <article className="post-card" aria-label={`Post by ${post.author?.username}`}>
      {/* Header */}
      <div className="post-card-header">
        <div className="post-author-info">
          {post.author?.profilePicture ? (
            <img
              src={post.author.profilePicture}
              alt={`${post.author.username} profile`}
              className="avatar avatar-sm"
              loading="lazy"
            />
          ) : (
            <div className="avatar avatar-sm avatar-placeholder" aria-hidden="true">
              {(post.author?.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div>
            <button
              type="button"
              className="link-button post-author-name"
              onClick={() => onNavigate && onNavigate(`/profile/${post.author?.username}`)}
            >
              {post.author?.username}
            </button>
            {post.location && <span className="post-location">{post.location}</span>}
          </div>
        </div>
        <div className="post-card-actions-menu">
          {isOwner ? (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowEditModal(true)}>
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-danger-text"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowReportModal(true)}>
              Report
            </button>
          )}
        </div>
      </div>

      {/* Media */}
      {post.media && post.media.length > 0 && (
        <div className="post-media">
          <img
            src={post.media[0].url}
            alt={post.caption ? `Post: ${post.caption.slice(0, 60)}` : 'Post image'}
            className="post-image"
            loading="lazy"
          />
        </div>
      )}

      {/* Actions */}
      <div className="post-card-footer">
        <div className="post-action-row">
          <button
            id={`like-btn-${post._id}`}
            type="button"
            className={`btn btn-ghost btn-sm post-action-btn${post.isLiked ? ' post-action-btn--active' : ''}`}
            onClick={handleToggleLike}
            disabled={isLiking}
            aria-pressed={post.isLiked}
            aria-label={post.isLiked ? 'Unlike post' : 'Like post'}
          >
            {post.isLiked ? '❤️' : '🤍'} {post.likesCount || 0}
          </button>

          <button
            id={`comment-btn-${post._id}`}
            type="button"
            className="btn btn-ghost btn-sm post-action-btn"
            onClick={() => setShowComments((v) => !v)}
            aria-expanded={showComments}
            aria-label="Toggle comments"
          >
            💬 {post.commentsCount || 0}
          </button>

          <button
            id={`save-btn-${post._id}`}
            type="button"
            className={`btn btn-ghost btn-sm post-action-btn${post.isSaved ? ' post-action-btn--active' : ''}`}
            onClick={handleToggleSave}
            disabled={isSaving}
            aria-pressed={post.isSaved}
            aria-label={post.isSaved ? 'Unsave post' : 'Save post'}
          >
            {post.isSaved ? '🔖' : '📌'}
          </button>
        </div>

        {/* Caption — plain text only */}
        {post.caption && (
          <p className="post-caption">
            <span className="post-caption-author">{post.author?.username} </span>
            {post.caption}
          </p>
        )}

        <p className="post-date">{formatDate(post.createdAt)}</p>

        <ErrorAlert error={actionError} onDismiss={() => setActionError(null)} />

        {showComments && <CommentSection postId={post._id} />}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit post">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Edit Post</h2>
              <button type="button" className="modal-close" onClick={() => setShowEditModal(false)} aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label htmlFor={`edit-caption-${post._id}`}>Caption</label>
                <textarea
                  id={`edit-caption-${post._id}`}
                  className="form-input"
                  rows={3}
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  maxLength={2200}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={handleReport}
        />
      )}
    </article>
  );
};

export default PostCard;
