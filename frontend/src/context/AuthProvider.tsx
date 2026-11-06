import { useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from './AuthContext';
import { api, clearAuthSession, loadAuthSession, saveAuthSession } from '../services/api';
import type { AuthSession } from '../services/api';

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  username: string;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AuthSession | null>(() => loadAuthSession());

  const login = async (username: string, password: string): Promise<void> => {
    const response = await api.post<LoginResponse>('/auth/login', { username, password });
    const nextSession: AuthSession = {
      token: response.data.access_token,
      username: response.data.username,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    };
    saveAuthSession(nextSession);
    setSession(nextSession);
  };

  const logout = (): void => {
    void api.post('/auth/logout').catch(() => undefined);
    clearAuthSession();
    setSession(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: session !== null,
      username: session?.username ?? null,
      login,
      logout,
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
