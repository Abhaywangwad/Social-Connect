import { API_URL } from '../config/api.js';

/**
 * Custom error class capturing HTTP status, backend message,
 * structured error code, and correlated X-Request-ID.
 */
export class ApiError extends Error {
  constructor(message, { status = 500, data = null, requestId = null, code = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.requestId = requestId;
    this.code = code;
  }
}

/**
 * Friendly fallback messages mapped to common HTTP status codes.
 */
const STATUS_MESSAGES = {
  400: 'Invalid request. Please check your input.',
  401: 'Authentication required or session has expired.',
  403: 'You do not have permission to access this resource.',
  404: 'The requested resource was not found.',
  409: 'A conflict occurred. The resource may already exist.',
  422: 'Validation failed on the submitted information.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Internal server error. Please try again later.',
};

class HttpClient {
  constructor() {
    this.baseURL = API_URL;
    this.accessToken = null;
    this.isRefreshing = false;
    this.refreshSubscribers = [];
    this.onAuthFailure = null;
  }

  setAccessToken(token) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken;
  }

  setOnAuthFailure(callback) {
    this.onAuthFailure = callback;
  }

  subscribeTokenRefresh(cb) {
    this.refreshSubscribers.push(cb);
  }

  onRefreshed(newToken) {
    this.refreshSubscribers.forEach((cb) => cb(newToken));
    this.refreshSubscribers = [];
  }

  onRefreshFailed(err) {
    this.refreshSubscribers.forEach((cb) => cb(null, err));
    this.refreshSubscribers = [];
  }

  /**
   * Performs an authenticated token refresh via HttpOnly cookie.
   */
  async refreshToken() {
    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new ApiError(data.message || 'Token refresh failed', {
          status: response.status,
          data,
          requestId: response.headers.get('x-request-id') || response.headers.get('X-Request-ID'),
        });
      }

      const newAccessToken = data.data?.accessToken;
      if (!newAccessToken) {
        throw new ApiError('No access token returned from refresh', { status: 500 });
      }

      this.setAccessToken(newAccessToken);
      return newAccessToken;
    } catch (err) {
      this.setAccessToken(null);
      if (typeof this.onAuthFailure === 'function') {
        this.onAuthFailure(err);
      }
      throw err;
    }
  }

  /**
   * Core request dispatcher with automatic 401 retry interceptor.
   */
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseURL}${endpoint}`;
    const headers = new Headers(options.headers || {});

    // Set authorization header if token exists
    if (this.accessToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    // Default Content-Type to application/json unless body is FormData
    const isFormData = options.body instanceof FormData;
    if (!isFormData && !headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    const config = {
      ...options,
      headers,
      credentials: 'include', // Ensure HttpOnly cookies are attached
    };

    if (!isFormData && options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);
      const requestId = response.headers.get('x-request-id') || response.headers.get('X-Request-ID');

      // ─── 401 Interception & Refresh Retry ──────────────────────────────────
      const isAuthRoute =
        endpoint.includes('/auth/login') ||
        endpoint.includes('/auth/refresh') ||
        endpoint.includes('/auth/register');

      if (response.status === 401 && !isAuthRoute && !options._isRetry) {
        if (!this.isRefreshing) {
          this.isRefreshing = true;

          try {
            const newToken = await this.refreshToken();
            this.isRefreshing = false;
            this.onRefreshed(newToken);

            // Retry the original request with the fresh token
            return this.request(endpoint, {
              ...options,
              _isRetry: true,
            });
          } catch (refreshErr) {
            this.isRefreshing = false;
            this.onRefreshFailed(refreshErr);
            throw refreshErr;
          }
        } else {
          // A refresh is already in flight; wait for it
          return new Promise((resolve, reject) => {
            this.subscribeTokenRefresh((newToken, err) => {
              if (err) {
                return reject(err);
              }
              resolve(
                this.request(endpoint, {
                  ...options,
                  _isRetry: true,
                })
              );
            });
          });
        }
      }

      // Parse JSON response
      let responseData = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        responseData = await response.json().catch(() => null);
      } else {
        responseData = await response.text().catch(() => null);
      }

      if (!response.ok) {
        const errorMsg =
          responseData?.message ||
          (Array.isArray(responseData?.errors) && responseData.errors[0]?.message) ||
          STATUS_MESSAGES[response.status] ||
          `HTTP Error ${response.status}`;

        throw new ApiError(errorMsg, {
          status: response.status,
          data: responseData,
          requestId,
          code: responseData?.code,
        });
      }

      return responseData;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      // Network or fetch connection error
      throw new ApiError(error.message || 'Network error occurred. Please check your connection.', {
        status: 0,
        data: null,
      });
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  upload(endpoint, formData, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: options.method || 'POST',
      body: formData,
    });
  }
}

export const api = new HttpClient();
export default api;
