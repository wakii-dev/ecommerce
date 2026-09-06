import { createContext, useEffect, useState, type ReactNode } from 'react';
import { authStore, type AuthUser } from './AuthStore';

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
}

/** null khi KHÔNG có AuthProvider — useAuth() sẽ fallback đọc trực tiếp authStore. */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Giữ React state đồng bộ với authStore singleton qua subscribe — mọi
 * setToken/refresh/logout đều re-render subtree. Mount 1 lần ở root app.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<AuthContextValue>(() => ({
    user: authStore.getUser(),
    isAuthenticated: authStore.isAuthenticated()
  }));

  useEffect(
    () =>
      authStore.subscribe(() => {
        setValue({
          user: authStore.getUser(),
          isAuthenticated: authStore.isAuthenticated()
        });
      }),
    []
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
