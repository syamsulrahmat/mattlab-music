import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export const parseApiError = (detail, fallback = 'An unexpected error occurred') => {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // Pydantic validation error objects list
    const messages = detail.map((d) => {
      if (typeof d === 'string') return d;
      if (d && typeof d === 'object') {
        const fieldName = Array.isArray(d.loc) && d.loc.length > 1 ? `${d.loc[d.loc.length - 1]}: ` : '';
        return `${fieldName}${d.msg || d.message || JSON.stringify(d)}`;
      }
      return String(d);
    });
    return messages.filter(Boolean).join('. ') || fallback;
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail);
  }
  return String(detail);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setAuthError(null);
      const res = await fetch('/api/auth/status', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to verify authentication status');
      }
      const data = await res.json();
      setSetupRequired(!!data.setup_required);
      setIsAuthenticated(!!data.authenticated);
      setUser(data.user || null);
    } catch (err) {
      console.error('[AUTH] Status check error:', err);
      // In case of network error, keep safe default
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const setupAdmin = async ({ username, password, display_name }) => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, display_name }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(parseApiError(data.detail, 'Failed to setup admin account'));
      }
      setUser(data.user);
      setIsAuthenticated(true);
      setSetupRequired(false);
      return data.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  const login = async ({ username, password }) => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(parseApiError(data.detail, 'Invalid username or password'));
      }
      setUser(data.user);
      setIsAuthenticated(true);
      setSetupRequired(false);
      return data.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('[AUTH] Logout error:', err);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const fetchUsers = async () => {
    const res = await fetch('/api/auth/users', {
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(parseApiError(data.detail, 'Failed to fetch users'));
    }
    return data.users || [];
  };

  const createUser = async ({ username, password, role, display_name }) => {
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password, role, display_name }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(parseApiError(data.detail, 'Failed to create user'));
    }
    return data.user;
  };

  const deleteUser = async (userId) => {
    const res = await fetch(`/api/auth/users/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(parseApiError(data.detail, 'Failed to delete user'));
    }
    return data;
  };

  const changePassword = async (userId, password) => {
    const res = await fetch(`/api/auth/users/${userId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(parseApiError(data.detail, 'Failed to update password'));
    }
    return data;
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        isAuthenticated,
        setupRequired,
        isLoading,
        authError,
        checkAuthStatus,
        setupAdmin,
        login,
        logout,
        fetchUsers,
        createUser,
        deleteUser,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
