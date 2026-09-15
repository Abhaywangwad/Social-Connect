import React from 'react';
import EmptyState from './EmptyState';

export default function PostGrid({ posts, isOwnProfile, onPostClick, onFirstPostClick }) {
  if (!posts || posts.length === 0) {
    return (
      <EmptyState 
        isOwnProfile={isOwnProfile} 
        onActionClick={onFirstPostClick} 
      />
    );
  }

  return (
    <div className="posts-grid" id="profile-posts-grid">
      {posts.map((post, index) => (
        <article 
          key={post.id || index} 
          className="post-card"
          id={`post-card-${post.id || index}`}
          onClick={() => onPostClick && onPostClick(post)}
          tabIndex={0}
          role="button"
          aria-label={`View post: ${post.caption || 'Photo'}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (onPostClick) {
                onPostClick(post);
              }
            }
          }}
        >
          <img 
            src={post.imageUrl} 
            alt={post.caption || `Post #${index + 1}`}
            className="post-thumbnail"
            loading="lazy"
            onError={(e) => {
              // Fallback placeholder with gradient if external image CDN fails
              e.currentTarget.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80';
            }}
          />

          {/* Hover Overlay with Likes & Comments Counts */}
          <div className="post-overlay" aria-hidden="true">
            <div className="overlay-stat">
              <svg className="overlay-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>{post.likes ? Number(post.likes).toLocaleString() : '0'}</span>
            </div>

            <div className="overlay-stat">
              <svg className="overlay-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span>{post.commentsCount ? Number(post.commentsCount).toLocaleString() : '0'}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
