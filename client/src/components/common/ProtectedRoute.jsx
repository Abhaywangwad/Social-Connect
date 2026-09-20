import React from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';

export const ProtectedRoute = ({ children, onNavigateToLogin }) => {
  const { status, isAuthenticated } = useAuth();

  if (status === 'loading') {
    return (
      <div className="protected-route-loading">
        <LoadingSpinner message="Checking session authentication..." size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof onNavigateToLogin === 'function') {
      onNavigateToLogin();
      return null;
    }
    return (
      <div className="unauthorized-placeholder">
        <h2>Authentication Required</h2>
        <p>You must be signed in to view this page.</p>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
