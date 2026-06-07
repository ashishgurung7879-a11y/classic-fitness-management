import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('cfp_user') || 'null'); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem('cfp_token') || '');

  const login = useCallback((userData, tokenValue, tokenKey = 'cfp_token', userKey = 'cfp_user') => {
    localStorage.setItem(tokenKey, tokenValue);
    localStorage.setItem(userKey, JSON.stringify(userData));
    setUser(userData);
    setToken(tokenValue);
  }, []);

  const logout = useCallback((tokenKey = 'cfp_token', userKey = 'cfp_user') => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    setUser(null);
    setToken('');
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
