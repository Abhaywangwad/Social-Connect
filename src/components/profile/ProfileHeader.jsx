import React from 'react';

export default function ProfileHeader({
  user,
  isFollowing,
  followersCount,
  onFollowToggle,
  onEditProfileClick,
  onMessageClick,
  isFollowLoading,
  onLogout
}) {
  if (!user) return null;

  // Format number for display (e.g. 1420 -> 1,420, 28450 -> 28.4K)
  const formatStat = (num) => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 10000) return (num / 1000).toFixed(1) + 'K';
    return Number(num).toLocaleString();
  };

  return (
    <header className="profile-header" id="profile-header">
      {/* Avatar Container with Instagram Gradient Outline Ring */}
      <div className="profile-avatar-container">
        <div className="profile-avatar-ring">
          <div className="profile-avatar-inner">
            <img 
              src={user.avatarUrl} 
              alt={`${user.fullName}'s avatar`} 
              className="profile-avatar-img"
              loading="lazy"
              onError={(e) => {
                // Fallback avatar if remote link fails
                e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName)}&background=6366f1&color=fff&size=300`;
              }}
            />
          </div>
        </div>
      </div>

      {/* Info Column */}
      <div className="profile-info">
        {/* Row 1: Username & Dynamic Action Buttons */}
        <div className="profile-title-row">
          <h2 className="profile-username" id="profile-username">
            {user.username}
            {user.isVerified && (
              <svg 
                className="verified-badge" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                aria-label="Verified account"
                title="Verified account"
              >
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7l-4.2-4.2 1.4-1.4 2.8 2.8 6.8-6.8 1.4 1.4-8.2 8.2z"/>
              </svg>
            )}
          </h2>

          <div className="profile-actions">
            {user.isOwnProfile ? (
              <>
                <button 
                  type="button" 
                  className="btn-profile" 
                  id="edit-profile-btn"
                  onClick={onEditProfileClick}
                >
                  Edit profile
                </button>
                <button 
                  type="button" 
                  className="btn-profile" 
                  id="share-profile-btn"
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(window.location.href);
                      alert('Profile link copied to clipboard!');
                    }
                  }}
                >
                  Share profile
                </button>
                {onLogout && (
                  <button 
                    type="button" 
                    className="btn-profile" 
                    id="profile-logout-btn"
                    onClick={onLogout}
                    title="Log out and switch to login form"
                  >
                    Log out
                  </button>
                )}
                <button 
                  type="button" 
                  className="btn-icon-square" 
                  id="profile-settings-btn"
                  aria-label="Profile settings"
                  title="Settings"
                  onClick={onLogout}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button 
                  type="button" 
                  id="follow-toggle-btn"
                  className={`btn-profile ${isFollowing ? 'btn-profile-following' : 'btn-profile-primary'}`}
                  onClick={onFollowToggle}
                  disabled={isFollowLoading}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
                <button 
                  type="button" 
                  className="btn-profile" 
                  id="message-user-btn"
                  onClick={onMessageClick}
                >
                  Message
                </button>
                <button 
                  type="button" 
                  className="btn-icon-square" 
                  id="user-options-btn"
                  aria-label="User options"
                  title="More options"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <circle cx="12" cy="12" r="1.5"></circle>
                    <circle cx="6" cy="12" r="1.5"></circle>
                    <circle cx="18" cy="12" r="1.5"></circle>
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Dynamic User Stats (Posts, Followers, Following) */}
        <ul className="profile-stats-row" id="profile-stats-list">
          <li className="stat-item" id="stat-posts">
            <span className="stat-number">{formatStat(user.stats?.posts ?? 0)}</span>
            <span>posts</span>
          </li>
          <li className="stat-item" id="stat-followers">
            <span className="stat-number">{formatStat(followersCount ?? user.stats?.followers ?? 0)}</span>
            <span>followers</span>
          </li>
          <li className="stat-item" id="stat-following">
            <span className="stat-number">{formatStat(user.stats?.following ?? 0)}</span>
            <span>following</span>
          </li>
        </ul>

        {/* Row 3: Bio Details */}
        <div className="profile-bio-section" id="profile-bio-section">
          <h1 className="profile-fullname">{user.fullName}</h1>
          {user.role && <span className="profile-role">{user.role}</span>}
          {user.bio && (
            <p className="profile-bio-text">{user.bio}</p>
          )}
          {user.website && (
            <a 
              href={user.website.startsWith('http') ? user.website : `https://${user.website}`}
              target="_blank" 
              rel="noopener noreferrer" 
              className="profile-website-link"
              id="profile-website-link"
            >
              <svg className="link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              <span>{user.website.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
