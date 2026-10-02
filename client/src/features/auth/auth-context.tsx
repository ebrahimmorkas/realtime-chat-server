import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, session } from '@/lib/api';
import type { AuthResponse, User } from '@/lib/types';

type Status = 'loading' | 'authenticated' | 'anonymous';

export interface RegisterInput {
  username: string;
  email: string;
  displayName: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  status: Status;
  login: (login: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(session.token);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>(session.token ? 'loading' : 'anonymous');

  useEffect(
    () =>
      session.subscribe((next) => {
        setToken(next);
        if (!next) {
          setUser(null);
          setStatus('anonymous');
          queryClient.clear();
        }
      }),
    [queryClient],
  );

  // Validate a stored token after a reload.
  useEffect(() => {
    if (!session.token) return;
    const controller = new AbortController();
    api<{ user: User }>('/auth/me', { signal: controller.signal })
      .then(({ user: me }) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!controller.signal.aborted) session.set(null);
      });
    return () => controller.abort();
  }, []);

  const finish = useCallback((res: AuthResponse) => {
    setUser(res.user);
    setStatus('authenticated');
    session.set(res.token);
    return res.user;
  }, []);

  const login = useCallback(
    async (loginId: string, password: string) =>
      finish(
        await api<AuthResponse>('/auth/login', {
          method: 'POST',
          body: { login: loginId, password },
        }),
      ),
    [finish],
  );

  const register = useCallback(
    async (input: RegisterInput) =>
      finish(await api<AuthResponse>('/auth/register', { method: 'POST', body: input })),
    [finish],
  );

  const logout = useCallback(() => session.set(null), []);

  const value = useMemo(
    () => ({ user, token, status, login, register, logout }),
    [user, token, status, login, register, logout],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For components that only render once signed in. */
export function useMe() {
  const { user } = useAuth();
  if (!user) throw new Error('useMe called while signed out');
  return user;
}
