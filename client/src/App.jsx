import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import Navbar from './components/common/Navbar.jsx';
import ProtectedRoute from './components/common/ProtectedRoute.jsx';
import LoadingSpinner from './components/common/LoadingSpinner.jsx';
import LoginForm from './components/auth/LoginForm.jsx';
import RegisterForm from './components/auth/RegisterForm.jsx';
import FeedView from './components/feed/FeedView.jsx';
import ProfileView from './components/profile/ProfileView.jsx';
import SearchView from './components/search/SearchView.jsx';
import MessagesView from './components/messages/MessagesView.jsx';
import NotificationsView from './components/notifications/NotificationsView.jsx';
import SavedPostsView from './components/saved/SavedPostsView.jsx';
import AdminDashboard from './components/admin/AdminDashboard.jsx';

/**
 * Lightweight client-side router using the browser History API.
 * Supports: /login, /register, /feed, /search, /messages,
 *           /notifications, /saved, /admin, /profile/:username
 */
const parseRoute = (path) => {
  if (!path || path === '/') return { view: 'feed' };
  const clean = path.replace(/^\//, '');
  const parts = clean.split('/');
  if (parts[0] === 'login') return { view: 'login' };
  if (parts[0] === 'register') return { view: 'register' };
  if (parts[0] === 'feed') return { view: 'feed' };
  if (parts[0] === 'search') return { view: 'search' };
  if (parts[0] === 'messages') return { view: 'messages' };
  if (parts[0] === 'notifications') return { view: 'notifications' };
  if (parts[0] === 'saved') return { view: 'saved' };
  if (parts[0] === 'admin') return { view: 'admin' };
  if (parts[0] === 'profile' && parts[1]) return { view: 'profile', username: parts[1] };
  if (parts[0] === 'post' && parts[1]) return { view: 'post', postId: parts[1] };
  return { view: 'feed' };
};

const AppContent = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [path, setPath] = useState(() => window.location.pathname);

  const navigate = useCallback((to) => {
    window.history.pushState({}, '', to);
    setPath(to);
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const route = parseRoute(path);
      if (route.view !== 'login' && route.view !== 'register') {
        navigate('/login');
      }
    }
  }, [isAuthenticated, isLoading, path, navigate]);

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const route = parseRoute(path);
      if (route.view === 'login' || route.view === 'register') {
        navigate('/feed');
      }
    }
  }, [isAuthenticated, isLoading, path, navigate]);

  if (isLoading) {
    return (
      <div className="app-loading">
        <LoadingSpinner message="Initialising Social Connect…" size="large" />
      </div>
    );
  }

  const route = parseRoute(path);

  if (!isAuthenticated) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          {route.view === 'register' ? (
            <RegisterForm
              onNavigateToLogin={() => navigate('/login')}
              onSuccess={() => navigate('/feed')}
            />
          ) : (
            <LoginForm
              onNavigateToRegister={() => navigate('/register')}
              onSuccess={() => navigate('/feed')}
            />
          )}
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (route.view) {
      case 'feed':
        return <FeedView />;
      case 'search':
        return <SearchView onNavigate={navigate} />;
      case 'messages':
        return <MessagesView onNavigate={navigate} />;
      case 'notifications':
        return <NotificationsView />;
      case 'saved':
        return <SavedPostsView onNavigate={navigate} />;
      case 'admin':
        return user?.role === 'ADMIN' ? (
          <AdminDashboard />
        ) : (
          <div className="unauthorized-placeholder">
            <h2>Access Denied</h2>
            <p>Admin access is required to view this page.</p>
          </div>
        );
      case 'profile':
        return <ProfileView username={route.username} onNavigate={navigate} />;
      default:
        return <FeedView />;
    }
  };

  return (
    <div className="app-layout">
      <Navbar currentPath={path} onNavigate={navigate} />
      <main className="main-content" id="main-content">
        <ProtectedRoute onNavigateToLogin={() => navigate('/login')}>
          {renderView()}
        </ProtectedRoute>
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
