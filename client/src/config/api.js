/**
 * Centralized API & WebSocket configuration for the frontend client.
 *
 * Reads endpoints from Vite environment variables (import.meta.env),
 * falling back safely to local development servers when not configured.
 */

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export default {
  API_URL,
  SOCKET_URL,
};
