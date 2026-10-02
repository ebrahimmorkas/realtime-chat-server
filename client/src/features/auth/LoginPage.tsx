import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  login: z.string().trim().min(1, 'Enter your username or email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

/** Users created by `npm run db:seed`. */
const DEMO_USERS = [
  { username: 'alice', name: 'Alice Johnson' },
  { username: 'bob', name: 'Bob Martinez' },
  { username: 'carol', name: 'Carol Singh' },
];
const DEMO_PASSWORD = 'Password123!';
const showDemo = import.meta.env.VITE_DEMO_ACCOUNTS !== 'false';

export function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Redirects happen in <RedirectIfAuthed> once the session is set.
  const signIn = async (id: string, password: string) => {
    setError(null);
    try {
      await login(id, password);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthLayout title="Log in">
      <form
        className="space-y-4"
        noValidate
        onSubmit={handleSubmit((v) => signIn(v.login, v.password))}
      >
        {error && <Alert>{error}</Alert>}
        <Field label="Username or email" error={errors.login?.message}>
          <Input autoComplete="username" {...register('login')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Log in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        New here?{' '}
        <Link to="/register" className="font-medium text-brand-600 hover:underline">
          Create an account
        </Link>
      </p>

      {showDemo && (
        <section
          aria-labelledby="demo-heading"
          className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800"
        >
          <h2 id="demo-heading" className="text-sm font-semibold">
            Try it with a demo account
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Tip: log in as Alice here and as Bob in a private window to chat in real time.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DEMO_USERS.map((user) => (
              <Button
                key={user.username}
                variant="secondary"
                className="h-auto flex-col gap-1.5 py-3"
                loading={demoLoading === user.username}
                disabled={demoLoading !== null}
                aria-label={`Log in as ${user.name}`}
                onClick={async () => {
                  setDemoLoading(user.username);
                  await signIn(user.username, DEMO_PASSWORD);
                  setDemoLoading(null);
                }}
              >
                <Avatar name={user.name} seed={user.username} size="sm" />
                <span className="text-xs">{user.name.split(' ')[0]}</span>
              </Button>
            ))}
          </div>
        </section>
      )}
    </AuthLayout>
  );
}
