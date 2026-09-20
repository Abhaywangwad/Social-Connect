import api from './api.js';

export const authService = {
  /**
   * Registers a new user.
   */
  async register(data) {
    return api.post('/auth/register', data);
  },

  /**
   * Logs in a user. Returns user object and access token.
   * Refresh token is securely set in HttpOnly cookie by backend.
   */
  async login(credentials) {
    const res = await api.post('/auth/login', credentials);
    if (res?.data?.accessToken) {
      api.setAccessToken(res.data.accessToken);
    }
    return res;
  },

  /**
   * Refreshes the access token using the HttpOnly cookie.
   */
  async refresh() {
    return api.refreshToken();
  },

  /**
   * Retrieves the currently authenticated user's profile.
   */
  async getMe() {
    return api.get('/auth/me');
  },

  /**
   * Logs out the current session and clears the refresh cookie.
   */
  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      api.setAccessToken(null);
    }
  },

  /**
   * Revokes all active sessions for the current user.
   */
  async logoutAll() {
    try {
      await api.post('/auth/logout-all');
    } finally {
      api.setAccessToken(null);
    }
  },

  /**
   * Gets list of active sessions for current user.
   */
  async getSessions() {
    return api.get('/auth/sessions');
  },

  /**
   * Revokes a specific session.
   */
  async revokeSession(sessionId) {
    return api.delete(`/auth/sessions/${sessionId}`);
  },

  /**
   * Changes the user's password.
   */
  async changePassword(passwords) {
    return api.patch('/auth/change-password', passwords);
  },
};

export default authService;
