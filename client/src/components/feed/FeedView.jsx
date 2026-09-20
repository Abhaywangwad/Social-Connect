import React, { useState, useEffect, useCallback, useRef } from 'react';
import postService from '../../services/postService.js';
import PostCard from '../posts/PostCard.jsx';
import LoadingSpinner from '../common/LoadingSpinner.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';
import CreatePostModal from '../posts/CreatePostModal.jsx';

export const FeedView = () => {
  const [posts, setPosts] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const isFetchingRef = useRef(false);

  const fetchFeed = useCallback(async (cursor = null) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!cursor) setIsLoading(true);
      else setIsLoadingMore(true);

      setError(null);
      const res = await postService.getFeed({ cursor, limit: 10 });
      const newPosts = res?.data?.posts || [];
      const cursorNext = res?.data?.nextCursor || null;
      const more = res?.data?.hasMore ?? Boolean(cursorNext);

      setPosts((prev) => cursor ? [...prev, ...newPosts] : newPosts);
      setNextCursor(cursorNext);
      setHasMore(more);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchFeed(null);
  }, [fetchFeed]);

  const handlePostCreated = (newPost) => {
    setPosts((prev) => [newPost, ...prev]);
    setShowCreateModal(false);
  };

  const handlePostDeleted = (postId) => {
    setPosts((prev) => prev.filter((p) => p._id !== postId));
  };

  const handlePostUpdated = (updatedPost) => {
    setPosts((prev) => prev.map((p) => (p._id === updatedPost._id ? updatedPost : p)));
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading your feed…" size="large" />;
  }

  return (
    <div className="feed-view">
      <div className="feed-header">
        <h1 className="feed-title">Home Feed</h1>
        <button
          id="create-post-btn"
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          + New Post
        </button>
      </div>

      <ErrorAlert error={error} onRetry={() => fetchFeed(null)} onDismiss={() => setError(null)} />

      {!isLoading && posts.length === 0 && !error && (
        <div className="feed-empty">
          <p>Your feed is empty. Follow people to see their posts here.</p>
          <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(true)}>
            Create your first post
          </button>
        </div>
      )}

      <div className="feed-posts" aria-live="polite" aria-label="Post feed">
        {posts.map((post) => (
          <PostCard
            key={post._id}
            post={post}
            onDeleted={handlePostDeleted}
            onUpdated={handlePostUpdated}
          />
        ))}
      </div>

      {hasMore && !isLoadingMore && (
        <div className="feed-load-more">
          <button
            id="load-more-feed-btn"
            type="button"
            className="btn btn-outline"
            onClick={() => fetchFeed(nextCursor)}
          >
            Load more posts
          </button>
        </div>
      )}

      {isLoadingMore && <LoadingSpinner message="Loading more…" size="small" />}

      {showCreateModal && (
        <CreatePostModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handlePostCreated}
        />
      )}
    </div>
  );
};

export default FeedView;
