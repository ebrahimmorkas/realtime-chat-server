import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

// Mirrors the API's registerSchema.
const schema = z.object({
  displayName: z.string().trim().min(1, 'Enter your name').max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,30}$/, '3–30 characters: letters, numbers, “_” and “.”'),
  email: z.email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .max(72)
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a number'),
});
type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const { register: signUp } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await signUp(values);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthLayout title="Create your account">
      <form className="space-y-4" noValidate onSubmit={handleSubmit(onSubmit)}>
        {error && <Alert>{error}</Alert>}
        <Field label="Your name" error={errors.displayName?.message}>
          <Input autoComplete="name" {...register('displayName')} />
        </Field>
        <Field label="Username" error={errors.username?.message} hint="Others find you by this.">
          <Input autoComplete="username" {...register('username')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-600 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
