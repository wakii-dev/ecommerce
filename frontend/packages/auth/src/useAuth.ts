import { useContext } from 'react';
import { authStore, type AuthUser } from './AuthStore';
import { AuthContext } from './provider';

export interface UseAuthResult {
  user: AuthUser | null;
  isAuthenticated: boolean;
  hasRole: (...roles: string[]) => boolean;
  logout: () => void;
}

/**
 * `{user, isAuthenticated, hasRole, logout}`.
 *
 * Trong AuthProvider → user/isAuthenticated reactive theo store. Ngoài
 * provider (test, app chưa mount) → vẫn đọc trực tiếp authStore nhưng
 * KHÔNG reactive.
 */
export function useAuth(): UseAuthResult {
  const ctx = useContext(AuthContext);
  return {
    user: ctx ? ctx.user : authStore.getUser(),
    isAuthenticated: ctx ? ctx.isAuthenticated : authStore.isAuthenticated(),
    hasRole: (...roles: string[]) => authStore.hasRole(...roles),
    logout: () => authStore.logout()
  };
}
