import { create } from 'zustand';
import api from '../services/api';
import type { User, UserRole } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ requiresTwoFactor?: boolean; tempToken?: string }>;
  verify2FA: (tempToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasMinRole: (role: UserRole) => boolean;
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  EMPLOYEE: 0, TEAM_LEAD: 1, HR: 2, PAYROLL_ADMIN: 3, ADMIN: 4, SUPER_ADMIN: 5,
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('accessToken'),
  isLoading: true,

  login: async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });

    if (data.requiresTwoFactor) {
      return { requiresTwoFactor: true, tempToken: data.tempToken };
    }

    localStorage.setItem('accessToken', data.tokens.accessToken);
    localStorage.setItem('refreshToken', data.tokens.refreshToken);
    set({ user: data.user, isAuthenticated: true });
    return {};
  },

  verify2FA: async (tempToken: string, code: string) => {
    const { data } = await api.post('/auth/verify-2fa', { tempToken, code });
    localStorage.setItem('accessToken', data.tokens.accessToken);
    localStorage.setItem('refreshToken', data.tokens.refreshToken);
    set({ user: data.user, isAuthenticated: true });
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },

  fetchUser: async () => {
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  hasPermission: (permission: string) => {
    const { user } = get();
    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true;
    // Simplified - full permission check is backend-side
    return true;
  },

  hasMinRole: (role: UserRole) => {
    const { user } = get();
    if (!user) return false;
    return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[role];
  },
}));
