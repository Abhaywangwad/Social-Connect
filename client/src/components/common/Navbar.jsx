import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import notificationService from '../../services/notificationService.js';

export const Navbar = ({ currentPath, onNavigate }) => {
  const { user, logout, isAuthenticated } = useAuth();
  const { isConnected } = useSocket();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const fetchUnread = async () => {
      try {
        const res = await notificationService.getUnreadCount();
        if (!cancelled) setUnreadNotifs(res?.data?.unreadCount || 0);
      } catch {
        // Silent — badge shows 0 if fetch fails
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const navLink = (label, path, badgeCount = 0) => {
    const isActive = currentPath === path;
    return (
      <button
        type="button"
        className={`nav-link${isActive ? ' nav-link--active' : ''}`}
        onClick={() => { onNavigate(path); setMenuOpen(false); }}
        aria-current={isActive ? 'page' : undefined}
      >
        {label}
        {badgeCount > 0 && (
          <span className="nav-badge" aria-label={`${badgeCount} unread`}>
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>
    );
  };

  if (!isAuthenticated) return null;

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar-brand">
        <button type="button" className="navbar-logo" onClick={() => onNavigate('/feed')}>
          Social Connect
        </button>
        <span
          className={`socket-status ${isConnected ? 'socket-status--connected' : 'socket-status--disconnected'}`}
          title={isConnected ? 'Real-time connected' : 'Reconnecting…'}
          aria-label={isConnected ? 'Real-time connected' : 'Disconnected'}
        />
      </div>

      <button
        type="button"
        className="navbar-hamburger"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-label="Toggle navigation menu"
      >
        ☰
      </button>

      <div className={`navbar-links${menuOpen ? ' navbar-links--open' : ''}`}>
        {navLink('Feed', '/feed')}
        {navLink('Search', '/search')}
        {navLink('Messages', '/messages')}
        {navLink('Notifications', '/notifications', unreadNotifs)}
        {navLink('Saved', '/saved')}
        {navLink('Profile', `/profile/${user?.username}`)}
        {user?.role === 'ADMIN' && navLink('Admin', '/admin')}

        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
