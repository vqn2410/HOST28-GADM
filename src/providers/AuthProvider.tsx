import React, { createContext, useContext, useEffect, useState } from 'react';
import { getEffectivePermissions, hasPermission } from '@/lib/permissions/rbac';
import { authenticateSgaeUser } from '@/repositories/settingsAndUsersRepository';
import type { Permission, SgaeUser } from '@/types/domain';

interface AuthContextValue {
  user: SgaeUser | null;
  isAuthenticated: boolean;
  loading: boolean;
  permissions: Permission[];
  can: (permission: Permission) => boolean;
  login: (dni: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_KEY = 'sgae_session_user_v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SgaeUser | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SgaeUser) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  }, [user]);

  const login = async (dni: string, password: string) => {
    setLoading(true);
    try {
      const result = await authenticateSgaeUser(dni, password);
      if (result.success) {
        setUser(result.user);
        return { success: true };
      }
      return { success: false, message: result.message };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Error de conexión con la base de datos.';
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
  };

  const permissions = getEffectivePermissions(user);
  const can = (permission: Permission) => hasPermission(user, permission);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        loading,
        permissions,
        can,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
