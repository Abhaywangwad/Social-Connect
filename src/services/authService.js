/**
 * Authentication Service for Social-Connect
 */

export const AUTH_CONFIG = {
  endpoint: '/api/auth/login',
  mockFallback: true,
  mockDelayMs: 100,
  demoUser: {
    email: 'alex@socialconnect.com',
    password: 'Password123!',
    name: 'Alex Morgan',
    role: 'Product Designer'
  }
};

/**
 * Sends authentication request to backend or handles fallback
 * @param {string} email 
 * @param {string} password 
 * @param {boolean} rememberMe 
 * @returns {Promise<{success: boolean, token?: string, user?: object, message?: string}>}
 */
export async function loginUser(email, password, rememberMe = false) {
  try {
    const response = await fetch(AUTH_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      let errorMessage = data.message || 'Authentication failed.';
      if (response.status === 401) {
        errorMessage = data.message || 'Incorrect email or password. Please try again.';
      } else if (response.status === 404) {
        errorMessage = data.message || 'No account found with this email address.';
      } else if (response.status === 429) {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (response.status >= 500) {
        errorMessage = 'Internal server error. Please try again shortly.';
      }
      return { success: false, message: errorMessage };
    }

    const token = data.token || 'jwt_' + Date.now();
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('sc_auth_token', token);
    storage.setItem('sc_user', JSON.stringify(data.user || { email }));

    return { success: true, token, user: data.user, message: 'Signed in successfully!' };
  } catch (err) {
    if (AUTH_CONFIG.mockFallback) {
      return await simulateMockAuth(email, password, rememberMe);
    }
    return {
      success: false,
      message: 'Unable to connect to authentication server. Please check your network.'
    };
  }
}

async function simulateMockAuth(email, password, rememberMe) {
  await new Promise(res => setTimeout(res, AUTH_CONFIG.mockDelayMs));

  const cleanEmail = (email || '').trim().toLowerCase();

  if (cleanEmail === AUTH_CONFIG.demoUser.email) {
    if (password !== AUTH_CONFIG.demoUser.password) {
      return {
        success: false,
        message: 'Incorrect password for this account. (Demo: Password123!)'
      };
    }
  } else if (password !== 'Password123!' && password.length < 8) {
    return {
      success: false,
      message: 'Invalid credentials. Please verify your email and password.'
    };
  }

  const token = 'sc_react_jwt_' + Math.random().toString(36).substring(2);
  const user = {
    email: cleanEmail,
    name: cleanEmail.split('@')[0],
    role: 'Social-Connect Member'
  };

  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem('sc_auth_token', token);
  storage.setItem('sc_user', JSON.stringify(user));

  return {
    success: true,
    token,
    user,
    message: `Welcome back, ${user.name}!`
  };
}

export function getCurrentSession() {
  const token = localStorage.getItem('sc_auth_token') || sessionStorage.getItem('sc_auth_token');
  const userRaw = localStorage.getItem('sc_user') || sessionStorage.getItem('sc_user');
  let user = null;
  try {
    user = userRaw ? JSON.parse(userRaw) : null;
  } catch (_e) {
    user = null;
  }
  return { token, user, isAuthenticated: Boolean(token) };
}

export function logoutUser() {
  localStorage.removeItem('sc_auth_token');
  localStorage.removeItem('sc_user');
  sessionStorage.removeItem('sc_auth_token');
  sessionStorage.removeItem('sc_user');
}
