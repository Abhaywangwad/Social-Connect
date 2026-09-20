import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api.js';
import authService from '../services/authService.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authenticated' | 'unauthenticated'
  const [authError, setAuthError] = useState(null);

  /**
   * Handle unrecoverable authentication failures (e.g., refresh token expired or revoked).
   */
  const handleAuthFailure = useCallback(() => {
    setUser(null);
    setToken(null);
    api.setAccessToken(null);
    setStatus('unauthenticated');
  }, []);

  /**
   * Bootstrap application: attempts session restoration via HttpOnly refresh cookie.
   */
  useEffect(() => {
    // Register global auth failure listener with the HTTP client
    api.setOnAuthFailure(handleAuthFailure);

    let isMounted = true;

    const bootstrapAuth = async () => {
      try {
        // Attempt to refresh access token using HttpOnly cookie
        const newAccessToken = await authService.refresh();
        if (!isMounted) return;

        api.setAccessToken(newAccessToken);
        setToken(newAccessToken);

        // Fetch current user identity
        const meRes = await authService.getMe();
        if (!isMounted) return;

        if (meRes?.data?.user) {
          setUser(meRes.data.user);
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }
      } catch {
        if (isMounted) {
          setUser(null);
          setToken(null);
          api.setAccessToken(null);
          setStatus('unauthenticated');
        }
      }
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, [handleAuthFailure]);

  /**
   * Logs in with identifier and password.
   */
  const login = async (credentials) => {
    setAuthError(null);
    try {
      const res = await authService.login(credentials);
      const userData = res?.data?.user;
      const accessToken = res?.data?.accessToken;

      setUser(userData);
      setToken(accessToken);
      setStatus('authenticated');
      return res;
    } catch (err) {
      setAuthError(err.message || 'Login failed');
      throw err;
    }
  };

  /**
   * Registers a new account.
   */
  const register = async (userData) => {
    setAuthError(null);
    try {
      const res = await authService.register(userData);
      return res;
    } catch (err) {
      setAuthError(err.message || 'Registration failed');
      throw err;
    }
  };

  /**
   * Logs out the user and clears state.
   */
  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // Continue cleanup even if server call fails
    } finally {
      handleAuthFailure();
    }
  };

  /**
   * Updates local user state when profile is edited.
   */
  const updateCurrentUser = (updatedUser) => {
    setUser((prev) => ({ ...prev, ...updatedUser }));
  };

  const value = {
    user,
    token,
    status,
    authError,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading',
    login,
    register,
    logout,
    updateCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
