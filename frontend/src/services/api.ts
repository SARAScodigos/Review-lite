import axios from 'axios';
import type { AxiosError } from 'axios';

export interface AuthSession {
  token: string;
  username: string;
  expiresAt: number;
}

const AUTH_STORAGE_KEY = 'areview.auth';

export const loadAuthSession = (): AuthSession | null => {
  try {
    const storedSession = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!storedSession) return null;

    const session = JSON.parse(storedSession) as AuthSession;
    if (!session.token || !session.username || session.expiresAt <= Date.now()) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

export const saveAuthSession = (session: AuthSession): void => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
};

export const clearAuthSession = (): void => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

// Instancia principal de Axios configurada para los endpoints de la API v1
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const session = loadAuthSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login') ?? false;
    if (error.response?.status === 401 && !isLoginRequest) {
      clearAuthSession();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login?expired=1');
      }
    }
    return Promise.reject(error);
  },
);

// Instancia para llamados de Health Check en la raíz del backend
export const healthApi = axios.create({
  baseURL: '/health-check',
  headers: {
    'Content-Type': 'application/json',
  },
});
