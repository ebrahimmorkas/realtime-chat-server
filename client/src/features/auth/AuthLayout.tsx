import { MessagesSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Spinner } from '@/components/ui/feedback';
import { useAuth } from './auth-context';

/** Centered card layout for the login and registration pages. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 via-white to-sky-50 px-4 py-10 dark:from-slate-950 dark:via-slate-950 dark:to-brand-900/30">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-2xl font-bold">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white">
            <MessagesSquare className="size-5" aria-hidden />
          </span>
          Chatterbox
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="mb-4 text-xl font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner label="Restoring session" />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/chat';
  if (status === 'authenticated') return <Navigate to={from} replace />;
  return children;
}
