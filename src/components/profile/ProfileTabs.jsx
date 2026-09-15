import React from 'react';

export default function ProfileTabs({ activeTab, onTabChange, isOwnProfile }) {
  return (
    <nav className="profile-tabs" aria-label="Profile tabs">
      <button 
        type="button" 
        id="tab-posts"
        className={`tab-btn ${activeTab === 'posts' ? 'active' : ''}`}
        onClick={() => onTabChange('posts')}
        aria-selected={activeTab === 'posts'}
        role="tab"
      >
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
        <span>Posts</span>
      </button>

      {isOwnProfile && (
        <button 
          type="button" 
          id="tab-saved"
          className={`tab-btn ${activeTab === 'saved' ? 'active' : ''}`}
          onClick={() => onTabChange('saved')}
          aria-selected={activeTab === 'saved'}
          role="tab"
        >
          <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Saved</span>
        </button>
      )}

      <button 
        type="button" 
        id="tab-tagged"
        className={`tab-btn ${activeTab === 'tagged' ? 'active' : ''}`}
        onClick={() => onTabChange('tagged')}
        aria-selected={activeTab === 'tagged'}
        role="tab"
      >
        <svg className="tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span>Tagged</span>
      </button>
    </nav>
  );
}
