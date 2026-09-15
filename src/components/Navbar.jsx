import React from 'react';

export default function Navbar({
  currentUsername,
  onUserSelect,
  activeView,
  onViewChange,
  currentUserAvatar,
  isAuthenticated,
  onLogout
}) {
  return (
    <header className="navbar" id="app-navbar">
      <div className="navbar-container">
        {/* Brand Logo */}
        <div 
          className="navbar-brand" 
          onClick={() => onViewChange('profile')} 
          role="button" 
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onViewChange('profile');
          }}
        >
          <svg 
            className="navbar-logo-icon" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span>Social-Connect</span>
        </div>

        {/* Profile Switcher (For rapid testing of Own Profile vs Other User vs Empty State) */}
        <div className="navbar-center">
          <div className="profile-switcher" title="Switch between profiles to test features">
            <span className="profile-switcher-label">👁️ View:</span>
            <select 
              id="profile-switcher-select"
              className="profile-switcher-select"
              value={currentUsername}
              onChange={(e) => {
                onUserSelect(e.target.value);
                if (activeView !== 'profile') {
                  onViewChange('profile');
                }
              }}
              aria-label="Select demo profile"
            >
              <option value="alexmorgan">Alex Morgan (My Profile)</option>
              <option value="elena_visuals">Elena Visuals (Other User)</option>
              <option value="new_creator">New Creator (Empty State)</option>
            </select>
          </div>
        </div>

        {/* Navigation Action Icons */}
        <nav className="navbar-actions">
          {/* Action button: Log Out vs Sign In */}
          {isAuthenticated ? (
            <button 
              type="button" 
              className="nav-link-btn"
              id="nav-logout-btn"
              onClick={onLogout}
              title="Log out of Social-Connect"
            >
              Log Out
            </button>
          ) : (
            <button 
              type="button" 
              className="nav-link-btn"
              id="nav-login-btn"
              onClick={() => onViewChange('login')}
            >
              Sign In
            </button>
          )}

          {/* Quick Profile Avatar Link */}
          <button 
            type="button" 
            className={`nav-avatar-btn ${activeView === 'profile' && currentUsername === 'alexmorgan' ? 'active' : ''}`}
            onClick={() => {
              onUserSelect('alexmorgan');
              onViewChange('profile');
            }}
            aria-label="Go to my profile"
            title="My Profile"
          >
            <img 
              src={currentUserAvatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80"} 
              alt="My Avatar" 
              className="nav-avatar-img"
            />
          </button>
        </nav>
      </div>
    </header>
  );
}
