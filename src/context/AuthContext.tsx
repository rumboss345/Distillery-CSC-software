import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchMe,
  getStoredToken,
  login as apiLogin,
  setStoredToken,
  type AuthUser,
} from '../lib/auth-api';
import {
  type PermissionKey,
  type ProcessStageKey,
  userHasPermission,
} from '../lib/permissions';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  hasPermission: (key: PermissionKey) => boolean;
  hasProcessAssignment: (key: ProcessStageKey) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const { user: me } = await fetchMe();
      setUser(me);
    } catch {
      setStoredToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: loggedInUser } = await apiLogin(email, password);
    setStoredToken(token);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (key: PermissionKey) => {
      if (!user) return false;
      return userHasPermission(user.role, user.permissions, key);
    },
    [user],
  );

  const hasProcessAssignment = useCallback(
    (key: ProcessStageKey) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return user.processAssignments?.includes(key) ?? false;
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, hasPermission, hasProcessAssignment }),
    [user, loading, login, logout, refreshUser, hasPermission, hasProcessAssignment],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
