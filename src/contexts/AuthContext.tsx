// src/contexts/AuthContext.tsx
// Global auth state: cookies mean the session survives page refreshes and
// works across devices. This context syncs the React tree with the server session.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { auth } from '../lib/pipelineClient';

interface User {
  id: number;
  email: string;
  name: string;
  google_id: string | null;
  avatar_url: string | null;
  email_verified: number;
  created_at: number;
  updated_at: number;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  loginWithGoogle: (googleToken: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Fetch the current session on mount.
  const fetchMe = useCallback(async () => {
    try {
      const data = await auth.me();
      if (data.ok) {
        setUser(data.user as User);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Keep session alive: re-check every 5 min so the React state stays in sync
  // with cookie expiry on the server side.
  useEffect(() => {
    if (!user) return;
    pollingRef.current = setInterval(fetchMe, 5 * 60 * 1000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [user, fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await auth.login(email, password);
      if (!data.ok) throw new Error(data.error || 'Login failed');
      setUser(data.user as User);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await auth.register(email, password, name);
      if (!data.ok) throw new Error(data.error || 'Registration failed');
      setUser(data.user as User);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async (googleToken: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await auth.google(googleToken);
      if (!data.ok) throw new Error(data.error || 'Google sign-in failed');
      setUser(data.user as User);
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setUser(null);
      Cookies.remove(auth.COOKIE_NAME);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
