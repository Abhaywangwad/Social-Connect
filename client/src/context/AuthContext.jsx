import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

// Holds the logged-in user so any component can read it with useAuth()
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On page load, ask the server who is logged in (based on the cookie)
  useEffect(() => {
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setUser(data.user);
  };

  const signup = async (form) => {
    const data = await api('/auth/signup', { method: 'POST', body: form });
    setUser(data.user);
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react/only-export-components -- small app, keeping the hook next to its provider
export const useAuth = () => useContext(AuthContext);
