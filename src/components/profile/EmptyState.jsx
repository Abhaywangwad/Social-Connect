import React from 'react';

export default function EmptyState({ isOwnProfile, onActionClick }) {
  return (
    <div className="empty-state" id="posts-empty-state">
      <div className="empty-icon-wrap" aria-hidden="true">
        <svg 
          className="empty-icon" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.8" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
      </div>
      <h3 className="empty-title">No Posts Yet</h3>
      <p className="empty-desc">
        {isOwnProfile 
          ? 'When you capture photos and share your visual world, they will appear here on your profile.'
          : 'This user has not published any photos or media posts yet. Check back soon!'}
      </p>
      {isOwnProfile && (
        <button 
          type="button" 
          className="btn-profile btn-profile-primary empty-action-btn"
          onClick={onActionClick}
        >
          Share your first photo
        </button>
      )}
    </div>
  );
}
