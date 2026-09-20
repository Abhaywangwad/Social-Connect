import React, { useState, useEffect, useCallback } from 'react';
import saveService from '../../services/saveService.js';
import LoadingSpinner from '../common/LoadingSpinner.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';

export const SavedPostsView = ({ onNavigate }) => {
  const [savedPosts, setSavedPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [unsavingIds, setUnsavingIds] = useState(new Set());

  const loadSaved = useCallback(async (pageNum = 1) => {
    try {
      if (pageNum === 1) setIsLoading(true);
      setError(null);
      const res = await saveService.getSavedPosts({ page: pageNum, limit: 12 });
      const posts = res?.data?.savedPosts || [];
      setSavedPosts((prev) => pageNum === 1 ? posts : [...prev, ...posts]);
      setHasMore(res?.data?.pagination?.hasNextPage || false);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSaved(1);
  }, [loadSaved]);

  const handleUnsave = async (postId) => {
    setUnsavingIds((prev) => new Set([...prev, postId]));
    try {
      await saveService.unsavePost(postId);
      setSavedPosts((prev) => prev.filter((p) => p._id !== postId));
    } catch (err) {
      setError(err);
    } finally {
      setUnsavingIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  if (isLoading) return <LoadingSpinner message="Loading saved posts…" size="large" />;

  return (
    <div className="saved-posts-view">
      <div className="saved-header">
        <h1>Saved Posts</h1>
        <p className="saved-subtitle">{savedPosts.length} saved</p>
      </div>

      <ErrorAlert error={error} onDismiss={() => setError(null)} />

      {savedPosts.length === 0 && !error && (
        <div className="empty-state">
          <p>No saved posts. Save posts to find them here later.</p>
        </div>
      )}

      <div className="profile-posts-grid saved-posts-grid" aria-label="Saved posts">
        {savedPosts.map((post) => (
          <div key={post._id} className="saved-post-item">
            <button
              type="button"
              className="profile-post-thumb"
              onClick={() => onNavigate && onNavigate(`/post/${post._id}`)}
              aria-label={`View saved post: ${post.caption?.slice(0, 40) || 'post'}`}
            >
              {post.media?.[0]?.url ? (
                <img src={post.media[0].url} alt="Saved post thumbnail" loading="lazy" />
              ) : (
                <div className="post-thumb-caption-only">
                  <span>{post.caption?.slice(0, 60) || '…'}</span>
                </div>
              )}
              <div className="post-thumb-overlay">
                <span>❤️ {post.likesCount || 0}</span>
              </div>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm saved-remove-btn"
              onClick={() => handleUnsave(post._id)}
              disabled={unsavingIds.has(post._id)}
              aria-label="Remove from saved"
            >
              {unsavingIds.has(post._id) ? '…' : '🗑 Unsave'}
            </button>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="load-more-center">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              loadSaved(next);
            }}
          >
            Load more saved posts
          </button>
        </div>
      )}
    </div>
  );
};

export default SavedPostsView;
