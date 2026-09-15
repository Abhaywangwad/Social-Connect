import React, { useState } from 'react';
import LoginForm from './components/LoginForm';
import ProfilePage from './components/profile/ProfilePage';
import Navbar from './components/Navbar';
import { getCurrentSession, logoutUser } from './services/authService';
import './styles/auth.css';
import './styles/profile.css';

export default function App() {
  const [session, setSession] = useState(() => getCurrentSession());
  const [activeView, setActiveView] = useState('login');
  const [selectedUsername, setSelectedUsername] = useState('alexmorgan');

  // Triggered when user successfully logs in from LoginForm
  const handleLoginSuccess = (_user) => {
    const freshSession = getCurrentSession();
    setSession(freshSession);
    setSelectedUsername('alexmorgan');
    setActiveView('profile');
  };

  // Triggered when user logs out from Navbar or ProfileHeader
  const handleLogout = () => {
    logoutUser();
    setSession({ token: null, user: null, isAuthenticated: false });
    setActiveView('login');
  };

  // Direct navigation from Login to Profile preview
  const handleExploreProfiles = () => {
    setActiveView('profile');
  };

  return (
    <div className="app-layout">
      {/* Ambient Animated Glow Lights */}
      <div className="background-glow" aria-hidden="true">
        <div className="glow-orb glow-orb-1"></div>
        <div className="glow-orb glow-orb-2"></div>
        <div className="glow-orb glow-orb-3"></div>
      </div>

      {/* Top Navigation Bar */}
      {activeView === 'profile' && (
        <Navbar 
          currentUsername={selectedUsername}
          onUserSelect={(username) => {
            setSelectedUsername(username);
          }}
          activeView={activeView}
          onViewChange={(view) => setActiveView(view)}
          currentUserAvatar={session?.user?.avatarUrl}
          isAuthenticated={session?.isAuthenticated}
          onLogout={handleLogout}
        />
      )}

      {/* Main Viewport */}
      {activeView === 'profile' ? (
        <ProfilePage 
          username={selectedUsername} 
          onLogout={handleLogout}
        />
      ) : (
        <main>
          <LoginForm 
            onLoginSuccess={handleLoginSuccess} 
            onExploreProfiles={handleExploreProfiles}
          />
        </main>
      )}
    </div>
  );
}
