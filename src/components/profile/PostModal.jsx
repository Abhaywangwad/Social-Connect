import React, { useEffect } from 'react';

export default function PostModal({ post, user, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!post) return null;

  return (
    <div 
      className="modal-backdrop" 
      id="post-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Post details"
    >
      <div className="modal-content post-modal-content">
        {/* Left column: High Res Image */}
        <div className="post-modal-image-col">
          <img 
            src={post.imageUrl} 
            alt={post.caption || 'Post detail'} 
            className="post-modal-image"
          />
        </div>

        {/* Right column: Info & Comments */}
        <div className="post-modal-details-col">
          {/* Header */}
          <div className="post-modal-header">
            <img 
              src={user?.avatarUrl} 
              alt={user?.username} 
              className="post-modal-avatar"
            />
            <div className="post-modal-username">{user?.username}</div>
            <button 
              type="button" 
              className="modal-close-btn" 
              style={{ marginLeft: 'auto' }}
              onClick={onClose}
              aria-label="Close modal"
            >
              &times;
            </button>
          </div>

          {/* Body */}
          <div className="post-modal-body">
            <div className="post-caption-row">
              <div>
                <strong>{user?.username} </strong>
                <span>{post.caption}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="post-modal-footer">
            <div className="post-modal-likes">
              {Number(post.likes || 0).toLocaleString()} likes
            </div>
            <div className="post-modal-timestamp">
              {post.createdAt || 'RECENTLY'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
